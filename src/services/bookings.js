// src/services/bookings.js
// All booking storage is now Prisma/Postgres, and every query is
// scoped by businessId. Nothing here trusts a global "the business" --
// it's always passed in by the caller.
import { prisma } from "../db.js";
import {
  nairobiNow,
  toMinutes,
  toHHMM,
  isValidDate,
  isValidTime,
  dayOfWeek,
  formatDate,
} from "../utils/time.js";

// A booking blocks its slot if it's paid, or if it's unpaid but its
// hold hasn't expired yet.
function isActive(booking, nowMs = Date.now()) {
  if (booking.status === "confirmed") return true;
  if (booking.status === "pending_payment") {
    return new Date(booking.holdExpiresAt).getTime() > nowMs;
  }
  return false; // cancelled, expired
}

// How long a booking occupies a technician. House calls also block
// travel time.
function occupiedMinutes(durationMinutes, type, business) {
  return (
    durationMinutes +
    (type === "house_call" ? business.houseCallBufferMinutes : 0)
  );
}

// ---------------------------------------------------------------------
// Services (business.services comes from Prisma's `include: { services: true }`)
// ---------------------------------------------------------------------
export function resolveServices(business, names) {
  const found = [];
  const unknown = [];
  for (const raw of names || []) {
    const wanted = String(raw).trim().toLowerCase();
    const match =
      business.services.find((s) => s.name.toLowerCase() === wanted) ||
      business.services.find((s) => s.name.toLowerCase().includes(wanted)) ||
      business.services.find((s) => wanted.includes(s.name.toLowerCase()));
    if (match) {
      if (!found.some((f) => f.id === match.id)) found.push(match);
    } else {
      unknown.push(raw);
    }
  }
  return { found, unknown };
}

function totals(business, services, type) {
  const durationMinutes = services.reduce(
    (sum, s) => sum + s.durationMinutes,
    0,
  );
  const price =
    services.reduce((sum, s) => sum + s.price, 0) +
    (type === "house_call" ? business.houseCallFee : 0);
  return { durationMinutes, price };
}

// ---------------------------------------------------------------------
// Availability -- business-scoped
// ---------------------------------------------------------------------
export async function getAvailableSlots({
  business,
  date,
  durationMinutes,
  type,
}) {
  if (!isValidDate(date)) {
    return { ok: false, error: "Invalid date. Use YYYY-MM-DD." };
  }

  const now = nairobiNow();
  if (date < now.date) {
    return { ok: false, error: "That date is in the past." };
  }

  const weekday = formatDate(date);
  if (!business.openDays.includes(dayOfWeek(date))) {
    return { ok: true, date, weekday, open: false, slots: [] };
  }

  const open = toMinutes(business.openTime);
  const close = toMinutes(business.closeTime);
  const blockLength = occupiedMinutes(durationMinutes, type, business);

  // Scoped by businessId -- Glow Nails' bookings never affect another
  // tenant's availability, and vice versa.
  const candidates = await prisma.booking.findMany({
    where: { businessId: business.id, date },
  });
  const active = candidates.filter((b) => isActive(b));

  const slots = [];
  for (
    let start = open;
    start + durationMinutes <= close;
    start += business.slotStepMinutes
  ) {
    if (date === now.date && start < now.minutes + business.minNoticeMinutes)
      continue;

    const end = start + blockLength;
    const overlapping = active.filter((b) => {
      const bStart = toMinutes(b.time);
      const bEnd =
        bStart + occupiedMinutes(b.durationMinutes, b.type, business);
      return bStart < end && start < bEnd;
    }).length;

    if (overlapping < business.technicians) slots.push(toHHMM(start));
  }

  return { ok: true, date, weekday, open: true, slots };
}

// ---------------------------------------------------------------------
// Create / confirm / look up -- all business-scoped
// ---------------------------------------------------------------------
export async function createBooking({
  business,
  customerId,
  phone,
  name,
  serviceNames,
  type,
  address,
  date,
  time,
}) {
  if (!["on_site", "house_call"].includes(type)) {
    return { ok: false, error: "booking_type must be on_site or house_call." };
  }
  if (type === "house_call" && !String(address || "").trim()) {
    return {
      ok: false,
      error: "A house call needs the customer's area or address.",
    };
  }
  if (!isValidTime(time)) {
    return { ok: false, error: "Invalid time. Use 24-hour HH:MM." };
  }

  const { found, unknown } = resolveServices(business, serviceNames);
  if (unknown.length || !found.length) {
    return {
      ok: false,
      error: `Unknown service(s): ${unknown.join(", ") || "none given"}. Valid services: ${business.services
        .map((s) => s.name)
        .join(", ")}.`,
    };
  }

  const { durationMinutes, price } = totals(business, found, type);

  // Re-check availability right now: never trust an earlier check.
  const availability = await getAvailableSlots({
    business,
    date,
    durationMinutes,
    type,
  });
  if (!availability.ok) return availability;
  if (!availability.open) {
    return { ok: false, error: `We're closed on ${availability.weekday}.` };
  }
  if (!availability.slots.includes(time)) {
    return {
      ok: false,
      error: `${time} on ${availability.weekday} is not available.`,
      available_times: availability.slots,
    };
  }

  // If this customer already has an unpaid hold with this business,
  // replace it instead of leaving a ghost. Scoped by businessId +
  // customerId, so a hold with a different business is untouched.
  await prisma.booking.updateMany({
    where: {
      businessId: business.id,
      customerId,
      status: "pending_payment",
      holdExpiresAt: { gt: new Date() },
    },
    data: { status: "cancelled" },
  });

  const booking = await prisma.booking.create({
    data: {
      businessId: business.id,
      customerId,
      name: String(name || "").trim() || "Customer",
      services: found.map((s) => s.name),
      type,
      address: type === "house_call" ? String(address).trim() : null,
      date,
      time,
      durationMinutes,
      totalPrice: price,
      currency: business.currency,
      status: "pending_payment",
      holdExpiresAt: new Date(Date.now() + business.holdMinutes * 60 * 1000),
    },
  });

  return { ok: true, booking };
}

export async function getBooking({ businessId, bookingId }) {
  return prisma.booking.findFirst({ where: { id: bookingId, businessId } });
}

// Called by the payment step (IntaSend webhook) once money is received.
export async function confirmBooking({ businessId, bookingId }) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, businessId },
  });
  if (!booking) return { ok: false, error: "Booking not found." };
  if (booking.status === "confirmed") return { ok: true, booking };
  if (booking.status === "cancelled") {
    return { ok: false, error: "Booking was cancelled." };
  }
  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "confirmed", confirmedAt: new Date() },
  });
  return { ok: true, booking: updated };
}

export async function listBookingsForPhone({ businessId, customerId }) {
  const bookings = await prisma.booking.findMany({
    where: { businessId, customerId },
  });
  return bookings.filter((b) => isActive(b));
}

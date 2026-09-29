import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { business } from "../config/business.js";
import {
  nairobiNow,
  toMinutes,
  toHHMM,
  isValidDate,
  isValidTime,
  dayOfWeek,
  formatDate,
} from "../utils/time.js";

// ---------------------------------------------------------------------
// Storage: a single JSON file. Fine for a demo (survives restarts, zero
// setup). Node runs this code one call at a time, so read-check-write
// below can't race. When you go multi-tenant, swap load()/save() for a
// real database and keep everything else the same.
// ---------------------------------------------------------------------
const DATA_DIR = process.env.DATA_DIR || path.resolve("data");
const FILE = path.join(DATA_DIR, "bookings.json");

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf-8"));
  } catch {
    return [];
  }
}

function save(bookings) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(bookings, null, 2));
}

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
function occupiedMinutes(durationMinutes, type) {
  return (
    durationMinutes +
    (type === "house_call" ? business.houseCallBufferMinutes : 0)
  );
}

// ---------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------
export function resolveServices(names) {
  const found = [];
  const unknown = [];
  for (const raw of names || []) {
    const wanted = String(raw).trim().toLowerCase();
    const match =
      business.services.find((s) => s.name.toLowerCase() === wanted) ||
      business.services.find((s) => s.name.toLowerCase().includes(wanted)) ||
      business.services.find((s) => wanted.includes(s.name.toLowerCase()));
    if (match) {
      if (!found.includes(match)) found.push(match);
    } else {
      unknown.push(raw);
    }
  }
  return { found, unknown };
}

function totals(services, type) {
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
// Availability
// ---------------------------------------------------------------------
export function getAvailableSlots({ date, durationMinutes, type }) {
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
  const blockLength = occupiedMinutes(durationMinutes, type);
  const active = load().filter((b) => b.date === date && isActive(b));
  const slots = [];

  for (
    let start = open;
    start + durationMinutes <= close;
    start += business.slotStepMinutes
  ) {
    // Too soon (only matters for today)
    if (date === now.date && start < now.minutes + business.minNoticeMinutes)
      continue;

    // Count existing bookings that overlap this candidate. If every
    // technician is already tied up, the slot is unavailable. This is
    // deliberately conservative: it never double-books.
    const end = start + blockLength;
    const overlapping = active.filter((b) => {
      const bStart = toMinutes(b.time);
      const bEnd = bStart + occupiedMinutes(b.durationMinutes, b.type);
      return bStart < end && start < bEnd;
    }).length;

    if (overlapping < business.technicians) slots.push(toHHMM(start));
  }

  return { ok: true, date, weekday, open: true, slots };
}

// ---------------------------------------------------------------------
// Create / confirm / look up
// ---------------------------------------------------------------------
export function createBooking({
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

  const { found, unknown } = resolveServices(serviceNames);
  if (unknown.length || !found.length) {
    return {
      ok: false,
      error: `Unknown service(s): ${unknown.join(", ") || "none given"}. Valid services: ${business.services
        .map((s) => s.name)
        .join(", ")}.`,
    };
  }

  const { durationMinutes, price } = totals(found, type);

  // Re-check availability right now: never trust an earlier check.
  const availability = getAvailableSlots({ date, durationMinutes, type });
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

  const bookings = load();
  const now = Date.now();

  // If this customer already has an unpaid hold (e.g. they changed
  // their mind about the time), replace it instead of leaving a ghost.
  for (const b of bookings) {
    if (
      b.phone === phone &&
      b.status === "pending_payment" &&
      isActive(b, now)
    ) {
      b.status = "cancelled";
    }
  }

  const booking = {
    id: `BK-${randomUUID().slice(0, 6).toUpperCase()}`,
    phone,
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
    holdExpiresAt: new Date(
      now + business.holdMinutes * 60 * 1000,
    ).toISOString(),
    createdAt: new Date(now).toISOString(),
  };

  bookings.push(booking);
  save(bookings);
  return { ok: true, booking };
}

export function getBooking(id) {
  return load().find((b) => b.id === id) || null;
}

// Called by the payment step (IntaSend webhook) once money is received.
export function confirmBooking(id) {
  const bookings = load();
  const booking = bookings.find((b) => b.id === id);
  if (!booking) return { ok: false, error: "Booking not found." };
  if (booking.status === "confirmed") return { ok: true, booking };
  if (booking.status === "cancelled") {
    return { ok: false, error: "Booking was cancelled." };
  }
  booking.status = "confirmed";
  booking.confirmedAt = new Date().toISOString();
  save(bookings);
  return { ok: true, booking };
}

export function listBookingsForPhone(phone) {
  return load().filter((b) => b.phone === phone && isActive(b));
}
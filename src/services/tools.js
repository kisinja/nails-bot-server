import { business } from "../config/business.js";
import {
  getAvailableSlots,
  createBooking,
  resolveServices,
} from "./bookings.js";

const serviceNames = business.services.map((s) => s.name);

// What the model is told it can do. It decides when to call these; our
// code (executeTool below) does the real work against real data.
export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "check_availability",
      description:
        "Get the free appointment start times for a given date. Always call this before offering or confirming a time. Only offer times returned here.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Exact date as YYYY-MM-DD, taken from the calendar.",
          },
          services: {
            type: "array",
            items: { type: "string", enum: serviceNames },
            description: "The service(s) the customer wants.",
          },
          booking_type: {
            type: "string",
            enum: ["on_site", "house_call"],
          },
        },
        required: ["date", "services", "booking_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_booking",
      description:
        "Hold an appointment slot for the customer. Call only after the customer has confirmed the summary. The slot is held until payment.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          time: {
            type: "string",
            description:
              "24-hour HH:MM, must be a time returned by check_availability.",
          },
          services: {
            type: "array",
            items: { type: "string", enum: serviceNames },
          },
          booking_type: { type: "string", enum: ["on_site", "house_call"] },
          customer_name: { type: "string" },
          address: {
            type: "string",
            description: "Customer's area/address. Required for house calls.",
          },
        },
        required: ["date", "time", "services", "booking_type", "customer_name"],
      },
    },
  },
];

// ctx.phone is the customer's WhatsApp number, supplied by our server,
// never by the model.
export function executeTool(name, args, ctx) {
  try {
    if (name === "check_availability") {
      const { found, unknown } = resolveServices(args.services);
      if (unknown.length || !found.length) {
        return {
          ok: false,
          error: `Unknown service(s): ${unknown.join(", ") || "none given"}.`,
        };
      }
      const durationMinutes = found.reduce(
        (sum, s) => sum + s.durationMinutes,
        0,
      );
      return getAvailableSlots({
        date: args.date,
        durationMinutes,
        type: args.booking_type,
      });
    }

    if (name === "create_booking") {
      const result = createBooking({
        phone: ctx.phone,
        name: args.customer_name,
        serviceNames: args.services,
        type: args.booking_type,
        address: args.address,
        date: args.date,
        time: args.time,
      });
      if (!result.ok) return result;
      const b = result.booking;
      // Return only what the model needs to talk about.
      return {
        ok: true,
        booking_id: b.id,
        services: b.services,
        booking_type: b.type,
        date: b.date,
        time: b.time,
        total: `${b.currency} ${b.totalPrice}`,
        held_until: b.holdExpiresAt,
        status: "held_awaiting_payment",
      };
    }

    return { ok: false, error: `Unknown tool: ${name}` };
  } catch (error) {
    console.error(`Tool ${name} failed:`, error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

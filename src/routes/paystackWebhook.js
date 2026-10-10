// src/routes/paystackWebhook.js
import { Router } from "express";
import crypto from "node:crypto";
import { confirmBooking } from "../services/bookings.js";
import { sendWhatsAppMessage } from "../services/whatsapp.js";

const router = Router();

// IMPORTANT: Paystack signs the *raw* request body, so this route must
// receive it unparsed -- mount it with express.raw() in index.js,
// BEFORE your global express.json() middleware. See the index.js note
// below.
router.post("/webhook/paystack", async (req, res) => {
  const signature = req.headers["x-paystack-signature"];
  const expected = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
    .update(req.body) // req.body is a raw Buffer here, not parsed JSON
    .digest("hex");

  if (signature !== expected) {
    console.warn("Paystack webhook: invalid signature, ignoring");
    return res.sendStatus(401);
  }

  res.sendStatus(200); // ack immediately -- Paystack retries on non-2xx

  try {
    const event = JSON.parse(req.body.toString("utf8"));

    if (event.event !== "charge.success") {
      return; // we only act on successful charges
    }

    const { businessId, bookingId } = event.data.metadata || {};
    if (!businessId || !bookingId) {
      console.error(
        "Paystack webhook: charge.success missing businessId/bookingId metadata",
        event.data,
      );
      return;
    }

    const result = await confirmBooking({ businessId, bookingId });
    if (!result.ok) {
      console.error("Paystack webhook: confirmBooking failed:", result.error);
      return;
    }

    const booking = result.booking;
    const customerPhone =
      booking.customer?.phone ?? event.data.mobile_money?.phone;

    if (!customerPhone) {
      console.error(
        `Paystack webhook: confirmed booking ${bookingId} but no phone to notify`,
      );
      return;
    }

    await sendWhatsAppMessage({
      businessId,
      toNumber: customerPhone,
      messageText: `✅ *Payment received!*\nYour booking is confirmed:\n*Service:* ${booking.services.join(", ")}\n*Date:* ${booking.date}\n*Time:* ${booking.time}\n\nSee you then!`,
    });
  } catch (error) {
    console.error("Error handling Paystack webhook:", error);
  }
});

export default router;


/* 

    curl https://api.paystack.co/charge \
  -H "Authorization: Bearer sk_test_2aa71e46aae809b0a6fd9afc236a8b9f6a19657b" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "254710000000@customers.geteljika.co.ke",
    "amount": 150000,
    "currency": "KES",
    "mobile_money": {
      "phone": "+254710000000",
      "provider": "mpesa"
    },
    "reference": "test-ref-001",
    "metadata": { "businessId": "glow-nails-seed", "bookingId": "test-booking-001" }
  }'

*/
// src/services/payments.js
import axios from "axios";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

// Paystack's test mode only accepts charges against its own
// designated test MSISDN, not arbitrary numbers -- so testing through
// a real WhatsApp conversation always tries to charge the real
// customer's number and fails with "Invalid phone number format".
// Set PAYSTACK_TEST_MODE=true to force every charge to the official
// test number instead, so you can verify the full webhook/confirm
// flow end to end.
//
// *** REMOVE or set PAYSTACK_TEST_MODE=false before going live ***
// (there's a Notion tracker item for this -- don't forget it).
const PAYSTACK_TEST_PHONE = "254710000000";

// Fires an M-Pesa STK push via Paystack's Charge API for a held
// booking. The customer approves the prompt on their own phone --
// Paystack then calls our webhook (see routes/paystackWebhook.js)
// when the charge succeeds or fails, which is what actually confirms
// the booking. This function only *starts* the charge.
export async function initiatePaystackCharge({ booking, business, phone }) {
  const chargePhone =
    process.env.PAYSTACK_TEST_MODE === "true" ? PAYSTACK_TEST_PHONE : phone;

  if (chargePhone !== phone) {
    console.warn(
      `PAYSTACK_TEST_MODE is on -- charging test number ${chargePhone} instead of ${phone}`,
    );
  }

  try {
    const response = await axios.post(
      `${PAYSTACK_BASE_URL}/charge`,
      {
        // Paystack requires an email on every charge. WhatsApp
        // customers don't give us one, so we synthesize a
        // non-deliverable placeholder -- Paystack never emails it.
        email: `${phone}@customers.geteljika.co.ke`,
        amount: booking.totalPrice * 100, // Paystack wants the amount in the currency's subunit (cents)
        currency: booking.currency,
        mobile_money: {
          phone: chargePhone,
          provider: "mpesa",
        },
        reference: booking.id,
        metadata: {
          businessId: business.id,
          bookingId: booking.id,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );
    return { ok: true, data: response.data };
  } catch (error) {
    console.error(
      "Paystack charge failed:",
      error.response?.data || error.message,
    );
    return { ok: false, error: "Could not start the payment prompt." };
  }
}

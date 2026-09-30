// src/routes/webhook.js
import { Router } from "express";
import { getGroqReply } from "../services/groq.js";
import { sendWhatsAppMessage } from "../services/whatsapp.js";
import { resolveBusinessFromWebhook } from "../services/businesses.js";

const router = Router();

// Step 1: Meta calls this once, when you register the webhook URL in
// the app dashboard, to confirm you control this endpoint. This is
// app-level, not per-business, so the verify token stays a single env var.
router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log("Webhook verified successfully");
    return res.status(200).send(challenge);
  }

  console.log("Webhook verification failed");
  return res.sendStatus(403);
});

// Step 2: Meta POSTs here every time a message (or status update)
// happens on ANY of your numbers, across ALL businesses.
router.post("/webhook", async (req, res) => {
  // Ack immediately -- Meta expects a fast 200, don't make it wait on
  // tenant resolution or the Groq call.
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    if (!message) {
      // Delivery/read status update, not an incoming message.
      return;
    }

    const fromNumber = message.from;
    const messageText = message.text?.body;

    if (!messageText) {
      console.log(`Received a non-text message from ${fromNumber}, skipping`);
      return;
    }

    // This is the step that makes the whole system multi-tenant: figure
    // out which business actually received this message, from the
    // phone_number_id in the payload -- never assume "the" business.
    const resolved = await resolveBusinessFromWebhook(req.body);
    if (!resolved.ok) {
      console.error("Could not resolve business for webhook:", resolved.error);
      return;
    }
    const { business } = resolved;

    console.log(
      `Message from ${fromNumber} to ${business.name}: ${messageText}`,
    );

    const reply = await getGroqReply(business, fromNumber, messageText);
    console.log(`Groq reply [${business.name}]: ${reply}`);

    await sendWhatsAppMessage({
      businessId: business.id,
      toNumber: fromNumber,
      messageText: reply,
    });
  } catch (error) {
    console.error("Error handling incoming webhook:", error);
  }
});

export default router;

import { Router } from "express";
import { getGroqReply } from "../services/groq.js";
import { sendWhatsAppMessage } from "../services/whatsapp.js";

const router = Router();

// Step 1: Meta calls this once, when you register the webhook URL in
// the app dashboard, to confirm you control this endpoint.
router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("=== WEBHOOK VERIFICATION ===");
  console.log("Mode:", mode);
  console.log("Token received:", token);
  console.log("Expected token:", process.env.WEBHOOK_VERIFY_TOKEN);
  console.log("Challenge:", challenge);

  if (mode === "subscribe" && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log("Webhook verified successfully");
    return res.status(200).send(challenge);
  }

  console.log("Webhook verification failed");
  return res.sendStatus(403);
});

// Step 2: Meta POSTs here every time a message (or status update)
// happens on your number.
router.post("/webhook", async (req, res) => {
  console.log("🔥 WEBHOOK POST RECEIVED");
  console.log(JSON.stringify(req.body, null, 2));
  // Ack immediately -- Meta expects a fast 200, don't make it wait on
  // the Groq call or it may retry/consider the webhook broken.
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    if (!message) {
      // This POST was something else -- a delivery/read status update,
      // not an incoming message. Nothing to do.
      console.log("ℹ️ Webhook received, but no message found");
      return;
    }

    const fromNumber = message.from;
    const messageText = message.text?.body;

    if (!messageText) {
      console.log(`Received a non-text message from ${fromNumber}, skipping`);
      return;
    }

    console.log(`Message from ${fromNumber}: ${messageText}`);

    const reply = await getGroqReply(fromNumber, messageText);
    console.log(`Groq reply: ${reply}`);

    await sendWhatsAppMessage(fromNumber, reply);
  } catch (error) {
    console.error("Error handling incoming webhook:", error);
  }
});

export default router;


/* 

  curl -X POST "https://graph.facebook.com/v21.0/1565265758043528/subscribed_apps" -H "Authorization: Bearer EAAYL0vTA5uwBSlkMU0ZBOxRJCknE3v1MtJ5Ue28jGlGuwjmLXZCMlNUiXCrhm6wI1DVjN9ob0AvOFWpAmJQ59PtYyMBcbt29kCCYlGsZBZAAeZAzHqp2pSN0AhMys5BGZA3MCxZAq3TSGprG7NJYolffYaCdYpu9H32eZC2y8JH28VabmeaxM0XvJbRvmFyyzqNWgWY3yPzrAc9mhMWRRUu20dMxLcXgHvA7USP6zGWHXXcWZCzLbUPjzDwm39ZCqJOqXpHbev18VLaIAgLDJ0mz3WrgZDZD"

  curl -X POST "https://graph.facebook.com/v21.0/1565265758043528/subscribed_apps" -H "Authorization: Bearer EAAYL0vTA5uwBSlkMU0ZBOxRJCknE3v1MtJ5Ue28jGlGuwjmLXZCMlNUiXCrhm6wI1DVjN9ob0AvOFWpAmJQ59PtYyMBcbt29kCCYlGsZBZAAeZAzHqp2pSN0AhMys5BGZA3MCxZAq3TSGprG7NJYolffYaCdYpu9H32eZC2y8JH28VabmeaxM0XvJbRvmFyyzqNWgWY3yPzrAc9mhMWRRUu20dMxLcXgHvA7USP6zGWHXXcWZCzLbUPjzDwm39ZCqJOqXpHbev18VLaIAgLDJ0mz3WrgZDZD" -H "Content-Type: application/json" -d "{\"override_callback_uri\":\"https://376a-102-0-20-178.ngrok-free.app/webhook\",\"verify_token\":\"whatsoko_verify_2026\"}"

*/
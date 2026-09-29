# WhatsApp nails bot — demo server

A minimal Express server that receives WhatsApp messages via Meta's
Cloud API webhook, sends them to Groq along with the nail salon's
business info, and replies to the customer. Built as the demo for a
WhatsApp customer-support SaaS.

## What it does

1. Meta sends incoming WhatsApp messages to `POST /webhook`.
2. The server immediately acknowledges Meta with a 200 (required —
   Meta retries if you don't respond fast).
3. It pulls out the sender's number and message text.
4. It sends the message to Groq, along with a system prompt built from
   `src/config/business.js` (services, prices, hours, booking flow).
5. It sends Groq's reply back to the customer via the WhatsApp
   Cloud API.

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Copy the environment file and fill in your real values:
   ```
   cp .env.example .env
   ```
   You'll need:
   - `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` — from your Meta
     app's WhatsApp > API Setup page
   - `WEBHOOK_VERIFY_TOKEN` — any random string you make up yourself
   - `GROQ_API_KEY` — from console.groq.com

3. Start the server:
   ```
   npm start
   ```
   You should see `Server listening on port 3000`.

4. Expose it publicly with ngrok, in a separate terminal:
   ```
   ngrok http 3000
   ```
   Copy the `https://...ngrok-free.app` URL it gives you.

5. Register the webhook with Meta:
   - Go to your app's WhatsApp > Configuration page
   - Set the Callback URL to `https://<your-ngrok-url>/webhook`
   - Set the Verify Token to the same value as `WEBHOOK_VERIFY_TOKEN`
     in your `.env`
   - Click Verify and Save — your server's terminal should log
     "Webhook verified successfully"
   - Subscribe to the `messages` field

6. Message your test WhatsApp number from your phone. You should see
   it logged in your terminal, followed by a reply appearing in
   WhatsApp within a few seconds.

## Notes

- The access token from the API Setup page is temporary (24h). For
  anything beyond quick testing, generate a permanent token via a
  System User in Meta Business Settings.
- Conversation history is stored in memory (`Map`) in
  `src/services/groq.js` — it resets whenever the server restarts.
  Fine for a demo; swap for a real database before this handles real
  customers.
- Business info is hardcoded in `src/config/business.js`. When this
  grows into the multi-tenant SaaS, this becomes a per-tenant database
  row instead of a static file.
- Double check the model name in `src/services/groq.js` against
  current options at console.groq.com/docs/models — Groq's catalog
  changes fairly often.

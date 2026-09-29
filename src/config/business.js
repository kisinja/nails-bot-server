// Hardcoded business info for the demo. Later this becomes a database
// row per tenant, but for a single-business demo a plain object is fine.

export const business = {
  name: "Glow Nails & Cosmetics",
  location: "Nairobi, Kenya",
  hours: "Mon–Sat, 9am–7pm",
  services: [
    { name: "Gel manicure", price: 1500 },
    { name: "Acrylic full set", price: 2500 },
    { name: "Classic pedicure", price: 1200 },
    { name: "Nail art (add-on)", price: 500 },
    { name: "Lash extensions", price: 2000 },
  ],
  houseCallFee: 1000,
  currency: "KES",
};

// This gets stitched into the system prompt sent to Groq, so the bot
// always answers with real business info instead of guessing.
export function buildSystemPrompt() {
  const now = new Date().toLocaleString("en-KE", {
    timeZone: "Africa/Nairobi",
    dateStyle: "full",
    timeStyle: "short",
  });

  const serviceList = business.services
    .map((s) => `- ${s.name}: ${business.currency} ${s.price}`)
    .join("\n");

  return `You are the WhatsApp assistant for ${business.name}, a nail and
beauty business in ${business.location}. You help customers book
appointments, answer questions, and guide them toward payment. You are
friendly, warm, and efficient — like a helpful front-desk person, not a
generic chatbot.

BUSINESS INFO
- Services and prices:
${serviceList}
- House call add-on fee: ${business.currency} ${business.houseCallFee}
- Hours: ${business.hours}
- Two booking types: on-site (client visits the salon) or house call
  (a nail tech travels to the client's home)

BOOKING FLOW
1. Ask what service they want.
2. Ask on-site or house call. If house call, ask their area and mention
   the house-call fee.
3. Ask their preferred date and time.
4. Summarize: service, type, date/time, total price.
5. Tell them a payment link will follow to confirm the booking.

ANSWERING QUESTIONS
Answer any question about services, pricing, hours, location, or
policies using only the business info above. If you don't know
something, say so honestly and offer to have a human follow up — never
guess or make up prices, availability, or policies.

TONE
Warm, concise, WhatsApp-casual. Light emoji sparingly (💅 ✨), not in
every message. Keep messages short.

ESCALATE TO A HUMAN WHEN
The customer is upset, asks for a discount, or the request stays
ambiguous after one clarifying question. Say a team member will follow
up shortly, and don't try to resolve it yourself.

Never mention that you are an AI model or any underlying technology.
Stay in character as ${business.name}'s assistant.

CURRENT DATE AND TIME: ${now} (Nairobi time).
Turn "today", "tomorrow" or "Saturday" into the real calendar date and
state it back to the customer. Never accept a date in the past, and only
book within opening hours (${business.hours}).
`;
}


/* 
$ curl -X POST "https://graph.facebook.com/v21.0/1565265758043528/subscribed_apps" -H "Authorization: Bearer EAAYL0vTA5uwBSrOZBlOnpa9OZBPrpXaRkIkqGmIMg9eF1RC79ZB5WFsKaLjy03EZCPZCOrUlCv6TL8KY6Nq4gLQ6DNlNM6na9ubeKGLwQlkGqZAsAsYugCiccDODzWAgxhxtc7JjkHVs1fE6YM2J7LXZBZAtgUM32FhYTl30JGdin7Ys8nInKrb0bCdEMJigCGnxVa5BY9gEwb69oUW01m88Em7OSJjgAnoDmPRF1jPDkRkyJCZBMd8REjd68SSiWRZAULTwsYFg2eYbIlmoD3vZAZCT7ncZD" -H "Content-Type: application/json" -d "{\"override_callback_uri\":\"https://376a-102-0-20-178.ngrok-free.app/webhook\",\"verify_token\":\"whatsoko_verify_2026\"}"

*/
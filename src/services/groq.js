import axios from "axios";
import { buildSystemPrompt } from "../config/business.js";

// Groq's API is OpenAI-compatible -- same request/response shape, just
// a different base URL and model names.
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Very simple in-memory conversation history, keyed by customer phone
// number. Fine for a demo; swap for a real database once you have more
// than one conversation to track or need it to survive a restart.
const conversationHistory = new Map();

function getHistory(fromNumber) {
  if (!conversationHistory.has(fromNumber)) {
    conversationHistory.set(fromNumber, []);
  }
  return conversationHistory.get(fromNumber);
}

export async function getGroqReply(fromNumber, userMessage) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    console.error("GROQ_API_KEY is missing!");
    return "Sorry, I'm having a little trouble right now — someone from our team will follow up with you shortly.";
  }

  const history = getHistory(fromNumber);
  history.push({ role: "user", content: userMessage });

  // Keep the last 10 turns so the prompt doesn't grow forever
  const trimmedHistory = history.slice(-10);

  const messages = [
    { role: "system", content: buildSystemPrompt() },
    ...trimmedHistory,
  ];

  try {
    const response = await axios.post(
      GROQ_API_URL,
      {
        // Free-tier friendly, fast, and solid quality. Check
        // console.groq.com/docs/models for the current model list if
        // this one errors out with a "model not found" response --
        // Groq's catalog changes fairly often.
        model: "openai/gpt-oss-20b", // model: "openai/gpt-oss-120b",
        messages,
        temperature: 0.6,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    const reply = response.data.choices[0].message.content;
    history.push({ role: "assistant", content: reply });
    return reply;
  } catch (error) {
    console.error("Groq API error:", error.response?.data || error.message);
    return "Sorry, I'm having a little trouble right now — someone from our team will follow up with you shortly.";
  }
}

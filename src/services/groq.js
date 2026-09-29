import axios from "axios";
import { buildSystemPrompt } from "../config/business.js";
import { toolDefinitions, executeTool } from "./tools.js";

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

async function callGroq(messages) {
  const response = await axios.post(
    GROQ_API_URL,
    {
      // Free-tier friendly, fast, and solid quality. Check
      // console.groq.com/docs/models if this errors with "model not
      // found" -- Groq's catalog changes fairly often.
      model: "openai/gpt-oss-20b",
      messages,
      tools: toolDefinitions,
      tool_choice: "auto",
      temperature: 0.4,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
    },
  );
  return response.data.choices[0].message;
}

export async function getGroqReply(fromNumber, userMessage) {
  const history = getHistory(fromNumber);
  history.push({ role: "user", content: userMessage });

  // Keep the last several turns so the prompt doesn't grow forever.
  // Tool-call exchanges aren't stored here -- they're resolved fully
  // within this one request, below.
  const trimmedHistory = history.slice(-16);

  const messages = [
    { role: "system", content: buildSystemPrompt() },
    ...trimmedHistory,
  ];

  try {
    // A tool round-trip is: model asks for a tool -> we run it for
    // real -> feed the result back -> model either answers or asks
    // for another tool. Cap it so a confused model can't loop forever.
    for (let round = 0; round < 4; round++) {
      const message = await callGroq(messages);

      if (!message.tool_calls || message.tool_calls.length === 0) {
        const reply =
          message.content?.trim() || "Sorry, could you say that again?";
        history.push({ role: "assistant", content: reply });
        return reply;
      }

      messages.push({
        role: "assistant",
        content: message.content || null,
        tool_calls: message.tool_calls,
      });

      for (const call of message.tool_calls) {
        let args = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }

        console.log(`Tool call: ${call.function.name}`, args);
        const result = executeTool(call.function.name, args, {
          phone: fromNumber,
        });
        console.log("Tool result:", result);

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      // Loop again so the model can respond to the tool result(s).
    }

    return "Sorry, I'm having trouble finishing that — someone from our team will follow up shortly.";
  } catch (error) {
    console.error("Groq API error:", error.response?.data || error.message);
    return "Sorry, I'm having a little trouble right now — someone from our team will follow up with you shortly.";
  }
}

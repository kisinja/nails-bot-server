// src/services/groq.js
import axios from "axios";
import { buildSystemPrompt } from "../config/business.js";
import { buildToolDefinitions, executeTool } from "./tools.js";
import {
  getOrCreateCustomer,
  getOrCreateConversation,
  getConversationHistory,
  appendMessage,
} from "./customers.js";
import { isEscalated } from "./escalation.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_RATE_LIMIT_RETRIES = 2;

// Groq's rate-limit error message includes the exact wait time, e.g.
// "Please try again in 3.3225s." -- parse it so we wait exactly as
// long as needed instead of guessing.
function extractRetryDelayMs(error) {
  const message = error.response?.data?.error?.message;
  const match = message?.match(/try again in ([\d.]+)s/i);
  if (!match) return null;
  return Math.ceil(parseFloat(match[1]) * 1000) + 250; // small buffer
}

function isRateLimitError(error) {
  return (
    error.response?.status === 429 ||
    error.response?.data?.error?.code === "rate_limit_exceeded"
  );
}

async function callGroq(messages, tools, attempt = 0) {
  try {
    const response = await axios.post(
      GROQ_API_URL,
      {
        model: "openai/gpt-oss-20b",
        messages,
        tools,
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
  } catch (error) {
    if (isRateLimitError(error) && attempt < MAX_RATE_LIMIT_RETRIES) {
      const delay = extractRetryDelayMs(error) ?? 1500 * (attempt + 1);
      console.warn(
        `Groq rate limited -- retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return callGroq(messages, tools, attempt + 1);
    }
    throw error;
  }
}

// `business` here is the row resolved by resolveBusinessFromWebhook,
// already including its services. Never trust a caller-supplied
// businessId that skips that resolution step.
export async function getGroqReply(business, fromNumber, userMessage) {
  const customer = await getOrCreateCustomer(business.id, fromNumber);
  const conversation = await getOrCreateConversation(business.id, customer.id);

  // Always log what the customer said, even if a human has taken over
  // -- the context needs to survive for whoever picks this up.
  await appendMessage(conversation.id, "user", userMessage);

  // If this conversation is escalated, stay quiet instead of running
  // the AI again -- a human is (or should be) handling it directly.
  if (await isEscalated(conversation.id)) {
    console.log(
      `Conversation ${conversation.id} is escalated -- skipping AI reply.`,
    );
    return null; // webhook.js won't send anything when this is null
  }

  const history = await getConversationHistory(conversation.id, 16);
  const tools = buildToolDefinitions(business);

  const messages = [
    { role: "system", content: buildSystemPrompt(business) },
    ...history,
  ];

  const ctx = {
    business,
    businessId: business.id,
    customerId: customer.id,
    conversationId: conversation.id,
    phone: fromNumber,
  };

  try {
    for (let round = 0; round < 4; round++) {
      const message = await callGroq(messages, tools);

      if (!message.tool_calls || message.tool_calls.length === 0) {
        const reply =
          message.content?.trim() || "Sorry, could you say that again?";
        await appendMessage(conversation.id, "assistant", reply);
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

        console.log(
          `Tool call [${business.name}]: ${call.function.name}`,
          args,
        );
        const result = await executeTool(call.function.name, args, ctx);
        console.log("Tool result:", result);

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      // Loop again so the model can respond to the tool result(s).
    }

    const fallback =
      "Sorry, I'm having trouble finishing that — someone from our team will follow up shortly.";
    await appendMessage(conversation.id, "assistant", fallback);
    return fallback;
  } catch (error) {
    console.error("Groq API error:", error.response?.data || error.message);
    const fallback = isRateLimitError(error)
      ? "Sorry, I'm getting a lot of messages right now — give me a few seconds and try again, or someone from our team will follow up shortly."
      : "Sorry, I'm having a little trouble right now — someone from our team will follow up with you shortly.";
    await appendMessage(conversation.id, "assistant", fallback);
    return fallback;
  }
}

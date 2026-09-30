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

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

async function callGroq(messages, tools) {
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
}

// `business` here is the row resolved by resolveBusinessFromWebhook,
// already including its services. Never trust a caller-supplied
// businessId that skips that resolution step.
export async function getGroqReply(business, fromNumber, userMessage) {
  const customer = await getOrCreateCustomer(business.id, fromNumber);
  const conversation = await getOrCreateConversation(business.id, customer.id);

  await appendMessage(conversation.id, "user", userMessage);

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
    return "Sorry, I'm having a little trouble right now — someone from our team will follow up with you shortly.";
  }
}

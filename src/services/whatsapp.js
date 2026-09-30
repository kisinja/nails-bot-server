// src/services/whatsapp.js
import axios from "axios";
import { getWhatsAppConfig } from "./businesses.js";

const GRAPH_API_VERSION = "v21.0";

export async function sendWhatsAppMessage({
  businessId,
  toNumber,
  messageText,
}) {
  const config = await getWhatsAppConfig(businessId);
  if (!config) {
    console.error(`No WhatsApp config found for business ${businessId}`);
    return;
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${config.phoneNumberId}/messages`;

  try {
    await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to: toNumber,
        type: "text",
        text: { body: messageText },
      },
      {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );
    console.log(`Reply sent to ${toNumber} (business ${businessId})`);
  } catch (error) {
    console.error(
      "Failed to send WhatsApp message:",
      error.response?.data || error.message,
    );
  }
}

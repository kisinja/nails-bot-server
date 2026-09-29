import axios from "axios";

const GRAPH_API_VERSION = "v21.0";

export async function sendWhatsAppMessage(toNumber, messageText) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

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
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log(`Reply sent to ${toNumber}`);
  } catch (error) {
    console.error(
      "Failed to send WhatsApp message:",
      error.response?.data || error.message
    );
  }
}

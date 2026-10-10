import { prisma } from "../db.js";
import { sendWhatsAppMessage } from "./whatsapp.js";

const AUTO_RESUME_HOURS = 3;

export async function escalateConversation({
  business,
  conversationId,
  customerPhone,
  reason,
  summary,
}) {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { needsHuman: true, escalatedAt: new Date() },
  });

  if (!business.ownerPhone) {
    console.warn(
      `Business "${business.name}" has no ownerPhone set -- escalation was recorded but no alert was sent.`,
    );
    return;
  }

  const message = `🙋 ${business.name} needs you!

Customer: ${customerPhone}
Reason: ${reason}${summary ? `\nDetails: ${summary}` : ""}

The bot has paused replying to this customer -- please message them directly on WhatsApp.`;

  await sendWhatsAppMessage({
    businessId: business.id,
    toNumber: business.ownerPhone,
    messageText: message,
  });
}

export async function isEscalated(conversationId) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation?.needsHuman) return false;

  const hoursSince =
    (Date.now() - new Date(conversation.escalatedAt).getTime()) /
    (1000 * 60 * 60);

  if (hoursSince > AUTO_RESUME_HOURS) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { needsHuman: false, escalatedAt: null },
    });
    return false;
  }

  return true;
}

export async function resolveEscalation(conversationId) {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { needsHuman: false, escalatedAt: null },
  });
}

// src/services/customers.js
// A customer's identity is (businessId, phone), never phone alone --
// the same person messaging two different businesses is two different
// customer records.
import { prisma } from "../db.js";

export async function getOrCreateCustomer(businessId, phone) {
  return prisma.customer.upsert({
    where: { businessId_phone: { businessId, phone } },
    update: {},
    create: { businessId, phone },
  });
}

export async function getOrCreateConversation(businessId, customerId) {
  return prisma.conversation.upsert({
    where: { businessId_customerId: { businessId, customerId } },
    update: {},
    create: { businessId, customerId },
  });
}

// Last N messages for this conversation, oldest first, in the
// {role, content} shape Groq expects.
export async function getConversationHistory(conversationId, limit = 16) {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return messages.reverse().map((m) => ({ role: m.role, content: m.content }));
}

export async function appendMessage(conversationId, role, content) {
  return prisma.message.create({
    data: { conversationId, role, content: content ?? "" },
  });
}

// src/services/businesses.js
// Tenant resolution and lookup. This is the only place that decides
// "which business is this?" -- nothing downstream should guess.
import { prisma } from "../db.js";

// Small in-process cache so every incoming message doesn't hit the DB
// twice just to find out which business owns the number. Cheap to
// invalidate: onboarding a new business or rotating a token just
// restarts the process (fine at this scale) or calls clearBusinessCache().
const cache = new Map(); // phoneNumberId -> { business, fetchedAt }
const CACHE_MS = 60_000;

export function clearBusinessCache() {
  cache.clear();
}

// The receiving phone_number_id is inside the webhook payload at
// change.value.metadata.phone_number_id -- this is how Meta tells you
// which of your WhatsApp numbers actually received the message.
export async function resolveBusinessFromWebhook(body) {
  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const phoneNumberId = change?.value?.metadata?.phone_number_id;

  if (!phoneNumberId) {
    return { ok: false, error: "No phone_number_id in webhook payload." };
  }

  const business = await getBusinessByPhoneNumberId(phoneNumberId);
  if (!business) {
    return {
      ok: false,
      error: `No business is configured for phone_number_id ${phoneNumberId}.`,
    };
  }

  return { ok: true, business };
}

export async function getBusinessByPhoneNumberId(phoneNumberId) {
  const hit = cache.get(phoneNumberId);
  if (hit && Date.now() - hit.fetchedAt < CACHE_MS) return hit.business;

  const whatsapp = await prisma.whatsAppAccount.findUnique({
    where: { phoneNumberId },
    include: { business: { include: { services: true } } },
  });
  const business = whatsapp?.business
    ? { ...whatsapp.business, whatsappAccessToken: whatsapp.accessToken }
    : null;

  cache.set(phoneNumberId, { business, fetchedAt: Date.now() });
  return business;
}

export async function getBusinessById(businessId) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { services: true },
  });
  if (!business) return null;
  return business;
}

// The ONLY function allowed to read WhatsApp credentials. Never pass
// the raw token further than this call site (no logging, no returning
// it to the AI or in any API response).
export async function getWhatsAppConfig(businessId) {
  const whatsapp = await prisma.whatsAppAccount.findUnique({
    where: { businessId },
  });
  if (!whatsapp) return null;
  return {
    phoneNumberId: whatsapp.phoneNumberId,
    accessToken: whatsapp.accessToken,
  };
}

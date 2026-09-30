// prisma/seed.js
// Seeds the first tenant (Glow Nails, your live demo) with its current
// config, unchanged. Run with: npx prisma db seed
import 'dotenv/config';
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const glowNails = await prisma.business.upsert({
    where: { id: "glow-nails-seed" },
    update: {},
    create: {
      id: "glow-nails-seed",
      name: "Glow Nails & Cosmetics",
      location: "Nairobi, Kenya",
      currency: "KES",
      timezone: "Africa/Nairobi",
      hours: "Mon–Sat, 9am–7pm",
      openDays: [1, 2, 3, 4, 5, 6],
      openTime: "09:00",
      closeTime: "19:00",
      slotStepMinutes: 60,
      minNoticeMinutes: 60,
      technicians: 2,
      houseCallFee: 1000,
      houseCallBufferMinutes: 45,
      holdMinutes: 30,
      services: {
        create: [
          { name: "Gel manicure", price: 1500, durationMinutes: 60 },
          { name: "Acrylic full set", price: 2500, durationMinutes: 90 },
          { name: "Classic pedicure", price: 1200, durationMinutes: 60 },
          { name: "Nail art (add-on)", price: 500, durationMinutes: 30 },
          { name: "Lash extensions", price: 2000, durationMinutes: 90 },
        ],
      },
      whatsapp: {
        create: {
          // This MUST match the real phone_number_id from your Meta
          // webhook payloads (change.value.metadata.phone_number_id) --
          // that's how an incoming message resolves to this business.
          phoneNumberId: process.env.GLOW_NAILS_PHONE_NUMBER_ID,
          accessToken: process.env.GLOW_NAILS_WHATSAPP_TOKEN,
        },
      },
    },
  });

  console.log("Seeded:", glowNails.name, glowNails.id);

  // Second tenant, for testing isolation (Step 21 in your doc).
  const testBeauty = await prisma.business.upsert({
    where: { id: "test-beauty-seed" },
    update: {},
    create: {
      id: "test-beauty-seed",
      name: "Test Beauty Studio",
      location: "Thika, Kenya",
      currency: "KES",
      timezone: "Africa/Nairobi",
      hours: "Mon–Fri, 10am–6pm",
      openDays: [1, 2, 3, 4, 5],
      openTime: "10:00",
      closeTime: "18:00",
      slotStepMinutes: 30,
      minNoticeMinutes: 30,
      technicians: 1,
      houseCallFee: 500,
      houseCallBufferMinutes: 30,
      holdMinutes: 20,
      services: {
        create: [
          { name: "Basic manicure", price: 800, durationMinutes: 45 },
          { name: "Spa pedicure", price: 1000, durationMinutes: 45 },
        ],
      },
      whatsapp: {
        create: {
          phoneNumberId:
            process.env.TEST_BEAUTY_PHONE_NUMBER_ID ||
            "test-beauty-phone-id-placeholder",
          accessToken: process.env.TEST_BEAUTY_WHATSAPP_TOKEN || "placeholder",
        },
      },
    },
  });

  console.log("Seeded:", testBeauty.name, testBeauty.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import "dotenv/config";
import express from "express";
import morgan from "morgan";
import webhookRouter from "./routes/webhook.js";
import { prisma } from "./db.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(morgan("combined"));
app.use(webhookRouter);

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.get("/", (req, res) => {
  res.send("ELJIKA AI multi-tenant WhatsApp bot server is running.");
});

// Now requires a businessId, since bookings are tenant-scoped.
// e.g. /admin/bookings?key=...&businessId=glow-nails-seed
app.get("/admin/bookings", async (req, res) => {
  if (req.query.key !== process.env.ADMIN_KEY) {
    return res.sendStatus(403);
  }
  if (!req.query.businessId) {
    return res.status(400).json({ error: "businessId query param required" });
  }
  try {
    const bookings = await prisma.booking.findMany({
      where: { businessId: req.query.businessId },
      orderBy: { createdAt: "desc" },
    });
    res.json(bookings);
  } catch (error) {
    console.error("Failed to load bookings:", error);
    res.status(500).json({ error: "Failed to load bookings" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀🚀 Server started on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhook`);
});

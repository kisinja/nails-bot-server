import "dotenv/config";
import express from "express";
import morgan from "morgan";
import webhookRouter from "./routes/webhook.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(morgan("combined"));
app.use(webhookRouter);

app.get("/health", (req, res) => {
  res.send("OK").status(200);
});

app.get("/", (req, res) => {
  res.send("Glow Nails WhatsApp bot server is running.");
});

app.listen(PORT, () => {
  console.log(`🚀🚀 Server started on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhook`);
});

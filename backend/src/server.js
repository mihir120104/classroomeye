require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const connectDB = require("./config/db");
const logger = require("./utils/logger");
const authRoutes = require("./routes/auth");
const sessionRoutes = require("./routes/sessions");
const stripeRoutes = require("./routes/stripe");
const { startWeeklyCron } = require("./services/cron");

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 4000;

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "classroomeye-backend" });
});

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173", credentials: true }));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });
app.use("/api/", apiLimiter);

// Stripe webhook MUST be before express.json()
app.use("/api/stripe", stripeRoutes);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth", authRoutes);
app.use("/api/sessions", sessionRoutes);
app.use((_req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err, _req, res, _next) => { logger.error("Unhandled error:", err); res.status(500).json({ error: "Internal server error" }); });

async function start() {
  await connectDB();
  startWeeklyCron();
  app.listen(PORT, () => logger.info(`Backend running on port ${PORT}`));
}

start();
module.exports = app;

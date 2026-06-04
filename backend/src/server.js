require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
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
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 4000;

// Health check first
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "classroomeye-backend" });
});

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
}));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 200,
  standardHeaders: true, legacyHeaders: false,
});
app.use("/api/", apiLimiter);

// Stripe webhook before express.json()
app.use("/api/stripe", stripeRoutes);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth", authRoutes);
app.use("/api/sessions", sessionRoutes);

app.use((_req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err, _req, res, _next) => {
  logger.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Socket.io signaling for WebRTC ──────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  logger.debug(`Socket connected: ${socket.id}`);

  // Join a session room
  socket.on("join-session", ({ sessionId, role, studentIndex, name }) => {
    socket.join(sessionId);
    socket.data = { sessionId, role, studentIndex, name };

    if (role === "student") {
      // Notify tutor that student is ready for WebRTC
      socket.to(sessionId).emit("student-ready", {
        studentIndex,
        name,
        socketId: socket.id,
      });
    }

    if (role === "tutor") {
      // Notify all students in room that tutor is connected
      socket.to(sessionId).emit("tutor-connected", { socketId: socket.id });
    }
  });

  // WebRTC signaling — student sends offer to tutor
  socket.on("webrtc-offer", ({ sessionId, studentIndex, offer }) => {
    socket.to(sessionId).emit("webrtc-offer", {
      studentIndex,
      offer,
      from: socket.id,
    });
  });

  // Tutor sends answer back to specific student
  socket.on("webrtc-answer", ({ to, answer, studentIndex }) => {
    io.to(to).emit("webrtc-answer", { answer, studentIndex });
  });

  // ICE candidate exchange
  socket.on("ice-candidate", ({ sessionId, candidate, to, studentIndex }) => {
    if (to) {
      io.to(to).emit("ice-candidate", {
        candidate, from: socket.id, studentIndex,
      });
    } else {
      socket.to(sessionId).emit("ice-candidate", {
        candidate, from: socket.id, studentIndex,
      });
    }
  });

  socket.on("disconnect", () => {
    const { sessionId, role, studentIndex, name } = socket.data || {};
    if (sessionId && role === "student") {
      io.to(sessionId).emit("student-disconnected", { studentIndex, name });
    }
  });
});

// Boot
async function start() {
  await connectDB();
  startWeeklyCron();
  httpServer.listen(PORT, () => logger.info(`Backend running on port ${PORT}`));
}

start();
module.exports = app;
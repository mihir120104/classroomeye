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

// Health check — before all middleware
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

// Stripe webhook MUST be before express.json()
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

// ── Socket.io — WebRTC signaling ──────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

// Track rooms: { sessionId: { tutor: socketId, students: { socketId: { studentIndex, name } } } }
const rooms = new Map();

io.on("connection", (socket) => {
  logger.debug(`Socket connected: ${socket.id}`);

  socket.on("join-session", ({ sessionId, role, studentIndex, name }) => {
    socket.join(sessionId);
    socket.data = { sessionId, role, studentIndex, name };

    if (!rooms.has(sessionId)) {
      rooms.set(sessionId, { tutor: null, students: new Map() });
    }
    const room = rooms.get(sessionId);

    if (role === "tutor") {
      room.tutor = socket.id;
      // Notify tutor about all existing students
      room.students.forEach((studentData, studentSocketId) => {
        socket.emit("student-ready", {
          studentIndex: studentData.studentIndex,
          socketId: studentSocketId,
          name: studentData.name,
        });
      });
    }

    if (role === "student") {
      room.students.set(socket.id, { studentIndex, name });

      // Notify tutor about this student
      if (room.tutor) {
        io.to(room.tutor).emit("student-ready", {
          studentIndex,
          socketId: socket.id,
          name,
        });
      }

      // Notify all OTHER students about this new student (for peer connections)
      room.students.forEach((studentData, studentSocketId) => {
        if (studentSocketId !== socket.id) {
          // Tell existing student about new student
          io.to(studentSocketId).emit("peer-joined", {
            socketId: socket.id,
            peerStudentIndex: studentIndex,
            name,
          });
          // Tell new student about existing student
          socket.emit("peer-joined", {
            socketId: studentSocketId,
            peerStudentIndex: studentData.studentIndex,
            name: studentData.name,
          });
        }
      });
    }
  });

  // WebRTC offer — from tutor to student, or student to student
  socket.on("webrtc-offer", ({ sessionId, studentIndex, offer, to, offerType }) => {
    const target = to || (() => {
      // Find student by index in room
      const room = rooms.get(sessionId);
      if (!room) return null;
      for (const [sid, data] of room.students) {
        if (data.studentIndex === studentIndex) return sid;
      }
      return null;
    })();

    if (target) {
      io.to(target).emit("webrtc-offer", {
        offer, from: socket.id, studentIndex, offerType: offerType || "tutor",
      });
    }
  });

  // WebRTC answer — back to whoever sent the offer
  socket.on("webrtc-answer", ({ to, answer, studentIndex, answerType }) => {
    io.to(to).emit("webrtc-answer", { answer, studentIndex, answerType });
  });

  // ICE candidate — forward to specific target
  socket.on("ice-candidate", ({ sessionId, candidate, to, studentIndex }) => {
    if (to) {
      io.to(to).emit("ice-candidate", { candidate, from: socket.id, studentIndex });
    } else {
      socket.to(sessionId).emit("ice-candidate", { candidate, from: socket.id, studentIndex });
    }
  });

  socket.on("disconnect", () => {
    const { sessionId, role, studentIndex, name } = socket.data || {};
    if (!sessionId) return;

    const room = rooms.get(sessionId);
    if (!room) return;

    if (role === "student") {
      room.students.delete(socket.id);
      // Notify tutor
      if (room.tutor) {
        io.to(room.tutor).emit("student-disconnected", { studentIndex, name });
      }
      // Notify other students
      room.students.forEach((_, studentSocketId) => {
        io.to(studentSocketId).emit("peer-disconnected", {
          socketId: socket.id,
          peerStudentIndex: studentIndex,
        });
      });
    }

    if (role === "tutor") {
      room.tutor = null;
    }

    // Clean up empty rooms
    if (!room.tutor && room.students.size === 0) {
      rooms.delete(sessionId);
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
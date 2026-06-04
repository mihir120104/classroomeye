const express = require("express");
const axios = require("axios");
const Session = require("../models/Session");
const User = require("../models/User");
const { requireAuth, requireCredits } = require("../middleware/auth");
const { generateClassSummary } = require("../services/llm");
const logger = require("../utils/logger");

const router = express.Router();
const AI_URL = () => process.env.AI_SERVICE_URL || "http://localhost:8000";

// In-memory snapshot cache
const snapshotCache = new Map();

// POST /api/sessions/start
router.post("/start", requireAuth, requireCredits, async (req, res) => {
  const { studentNames = [] } = req.body;
  try {
    const students = studentNames.map((name) => ({
      name, engagementTimeline: [], attentionDrops: [],
    }));
    const session = await Session.create({
      tutorId: req.user._id,
      studentCount: studentNames.length,
      students,
      status: "live",
    });
    if (req.user.plan === "free") {
      await User.findByIdAndUpdate(req.user._id, { $inc: { sessionsUsed: 1 } });
    }
    res.status(201).json({ sessionId: session._id, startTime: session.startTime });
  } catch (err) {
    logger.error("Failed to start session:", err);
    res.status(500).json({ error: "Could not start session" });
  }
});

// POST /api/sessions/:id/frames — no auth (students use this)
router.post("/:id/frames", async (req, res) => {
  const { frames } = req.body;
  if (!Array.isArray(frames) || frames.length === 0) {
    return res.status(400).json({ error: "frames array required" });
  }

  let session;
  try {
    session = await Session.findOne({ _id: req.params.id, status: "live" });
    if (!session) return res.status(404).json({ error: "Live session not found" });
  } catch {
    return res.status(400).json({ error: "Invalid session ID" });
  }

  let aiResults;
  try {
    const { data } = await axios.post(
      `${AI_URL()}/analyze/batch`,
      { frames: frames.map((f) => ({ frame: f.frame, student_id: String(f.studentIndex) })) },
      { timeout: 10000 }
    );
    aiResults = data.results;
  } catch (err) {
    logger.warn("AI service error:", err.message);
    return res.json({
      timestamp: new Date(),
      scores: frames.map((f) => ({
        studentIndex: f.studentIndex,
        engagementScore: 0,
        isPresent: false,
        yaw: 0,
        pitch: 0,
      })),
    });
  }

  const now = new Date();

  // Cache latest frame per student — INSIDE the route handler
  frames.forEach((f) => {
    if (f.frame) {
      const key = `${req.params.id}:${f.studentIndex}`;
      snapshotCache.set(key, f.frame);
      setTimeout(() => snapshotCache.delete(key), 30000);
    }
  });

  // Use correct studentIndex from frame request (not loop index)
  const snapshotScores = new Array(session.students.length).fill(0);

  aiResults.forEach((result, idx) => {
    const studentIdx = frames[idx]?.studentIndex ?? idx;
    const student = session.students[studentIdx];
    if (!student) return;

    student.engagementTimeline.push({
      timestamp: now,
      score: result.engagement_score,
      yaw: result.yaw,
      pitch: result.pitch,
      eyeOpenness: result.eye_openness,
      isPresent: result.is_present,
    });

    if (result.engagement_score < 40 && result.is_present) {
      student.attentionDrops.push(now);
    }

    snapshotScores[studentIdx] = result.engagement_score ?? 0;
  });

  session.timeline.push({ timestamp: now, scores: snapshotScores });
  session.save().catch((e) => logger.error("Session save error:", e));

  res.json({
    timestamp: now,
    scores: aiResults.map((result, idx) => ({
      studentIndex: frames[idx]?.studentIndex ?? idx,
      engagementScore: Math.round(result.engagement_score),
      isPresent: result.is_present,
      yaw: result.yaw,
      pitch: result.pitch,
    })),
  });
});

// POST /api/sessions/:id/end
router.post("/:id/end", requireAuth, async (req, res) => {
  let session;
  try {
    session = await Session.findOne({ _id: req.params.id, tutorId: req.user._id });
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.status === "completed") return res.json({ message: "Already completed" });
  } catch {
    return res.status(400).json({ error: "Invalid session ID" });
  }

  session.endTime = new Date();
  session.status = "completed";

  session.students.forEach((student) => {
    const scores = student.engagementTimeline.map((e) => e.score).filter((s) => s > 0);
    student.averageScore = scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const presentCount = student.engagementTimeline.filter((e) => e.isPresent).length;
    student.attendanceFlag = student.engagementTimeline.length === 0
      ? false : presentCount / student.engagementTimeline.length >= 0.2;
  });

  await session.save();

  generateClassSummary(session)
    .then((summary) => {
      if (summary) Session.findByIdAndUpdate(session._id, { aiSummary: summary }).exec();
    })
    .catch(() => {});

  res.json({
    sessionId: session._id,
    durationSeconds: session.durationSeconds,
    averageEngagement: session.averageEngagement,
    studentCount: session.studentCount,
  });
});

// GET /api/sessions — list sessions
router.get("/", requireAuth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 10);
  const sessions = await Session.find(
    { tutorId: req.user._id, status: { $in: ["live", "completed"] } },
    { timeline: 0, "students.engagementTimeline": 0 }
  ).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
  const total = await Session.countDocuments({
    tutorId: req.user._id, status: { $in: ["live", "completed"] },
  });
  res.json({ sessions, total, page, pages: Math.ceil(total / limit) });
});

// GET /api/sessions/:id/snapshots — latest frame per student
router.get("/:id/snapshots", requireAuth, async (req, res) => {
  try {
    const session = await Session.findOne(
      { _id: req.params.id, tutorId: req.user._id },
      { "students.name": 1, studentCount: 1 }
    ).lean();
    if (!session) return res.status(404).json({ error: "Session not found" });

    const snapshots = session.students.map((student, idx) => {
      const frame = snapshotCache.get(`${req.params.id}:${idx}`);
      return {
        studentIndex: idx,
        name: student.name,
        hasSnapshot: !!frame,
        frame: frame ? `data:image/jpeg;base64,${frame}` : null,
      };
    });

    res.json({ snapshots });
  } catch {
    res.status(400).json({ error: "Invalid session ID" });
  }
});

// GET /api/sessions/:id/scores — latest score per student
router.get("/:id/scores", requireAuth, async (req, res) => {
  try {
    const session = await Session.findOne(
      { _id: req.params.id, tutorId: req.user._id },
      {
        status: 1,
        "students.name": 1,
        "students.averageScore": 1,
        "students.engagementTimeline": { $slice: -3 },
        "students.attentionDrops": 1,
      }
    ).lean();
    if (!session) return res.status(404).json({ error: "Session not found" });

    const scores = session.students.map((student, idx) => {
      const timeline = student.engagementTimeline || [];
      const latest = timeline.length > 0 ? timeline[timeline.length - 1] : null;
      return {
        studentIndex: idx,
        name: student.name,
        score: latest?.score ?? null,
        isPresent: latest?.isPresent ?? false,
        timestamp: latest?.timestamp ?? null,
        attentionDrops: student.attentionDrops?.length || 0,
      };
    });

    res.json({ scores, status: session.status });
  } catch {
    res.status(400).json({ error: "Invalid session ID" });
  }
});

// GET /api/sessions/:id/status — PUBLIC, no auth
router.get("/:id/status", async (req, res) => {
  try {
    const session = await Session.findById(
      req.params.id,
      { status: 1, startTime: 1, "students.name": 1 }
    ).lean();
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json({
      status: session.status,
      isLive: session.status === "live",
      startTime: session.startTime,
      studentCount: session.students?.length || 0,
    });
  } catch {
    res.status(400).json({ error: "Invalid session ID" });
  }
});

// POST /api/sessions/:id/join — PUBLIC, no auth
router.post("/:id/join", async (req, res) => {
  const { name, email } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Name is required" });

  let session;
  try {
    session = await Session.findById(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.status === "completed") {
      return res.status(403).json({ error: "Session has ended", code: "SESSION_ENDED" });
    }
  } catch {
    return res.status(400).json({ error: "Invalid session ID" });
  }

  const existing = session.students.findIndex(
    (s) => s.name.toLowerCase().trim() === name.toLowerCase().trim()
  );

  if (existing !== -1) {
    return res.json({
      studentIndex: existing,
      name: session.students[existing].name,
      sessionId: session._id,
      rejoined: true,
    });
  }

  session.students.push({
    name: name.trim(),
    email: email?.trim()?.toLowerCase() || null,
    engagementTimeline: [],
    attentionDrops: [],
  });
  session.studentCount = session.students.length;
  await session.save();

  res.json({
    studentIndex: session.students.length - 1,
    name: name.trim(),
    sessionId: session._id,
    rejoined: false,
  });
});

// GET /api/sessions/:id — full session detail
router.get("/:id", requireAuth, async (req, res) => {
  try {
    let session = await Session.findOne({
      _id: req.params.id, tutorId: req.user._id,
    }).lean();
    if (!session) return res.status(404).json({ error: "Session not found" });

    if (session.status === "live" && session.startTime) {
      const ageHours = (Date.now() - new Date(session.startTime).getTime()) / 3600000;
      if (ageHours > 4) {
        await Session.findByIdAndUpdate(session._id, { status: "completed", endTime: new Date() });
        session = { ...session, status: "completed" };
      }
    }
    res.json({ session });
  } catch {
    res.status(400).json({ error: "Invalid session ID" });
  }
});

module.exports = router;
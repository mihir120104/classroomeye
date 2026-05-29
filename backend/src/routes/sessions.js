const express = require("express");
const axios = require("axios");
const Session = require("../models/Session");
const User = require("../models/User");
const { requireAuth, requireCredits } = require("../middleware/auth");
const { generateClassSummary } = require("../services/llm");
const logger = require("../utils/logger");

const router = express.Router();
const AI_URL = () => process.env.AI_SERVICE_URL || "http://localhost:8000";

router.post("/start", requireAuth, requireCredits, async (req, res) => {
  const { studentNames = [] } = req.body;
  try {
    const students = studentNames.map((name) => ({ name, engagementTimeline: [], attentionDrops: [] }));
    const session = await Session.create({ tutorId: req.user._id, studentCount: studentNames.length, students, status: "live" });
    if (req.user.plan === "free") {
      await User.findByIdAndUpdate(req.user._id, { $inc: { sessionsUsed: 1 } });
    }
    res.status(201).json({ sessionId: session._id, startTime: session.startTime });
  } catch (err) {
    logger.error("Failed to start session:", err);
    res.status(500).json({ error: "Could not start session" });
  }
});

router.post("/:id/frames", requireAuth, async (req, res) => {
  const { frames } = req.body;
  if (!Array.isArray(frames) || frames.length === 0) return res.status(400).json({ error: "frames array required" });
  let session;
  try {
    session = await Session.findOne({ _id: req.params.id, tutorId: req.user._id, status: "live" });
    if (!session) return res.status(404).json({ error: "Live session not found" });
  } catch { return res.status(400).json({ error: "Invalid session ID" }); }

  let aiResults;
  try {
    const { data } = await axios.post(`${AI_URL()}/analyze/batch`,
      { frames: frames.map((f) => ({ frame: f.frame, student_id: String(f.studentIndex) })) },
      { timeout: 10000 }
    );
    aiResults = data.results;
  } catch (err) {
    logger.warn("AI service error:", err.message);
    // Return zero scores instead of 502 so frontend updates
    const fallbackScores = frames.map((f, idx) => ({
      studentIndex: idx,
      engagementScore: 0,
      isPresent: false,
      yaw: 0,
      pitch: 0,
    }));
    return res.json({ timestamp: new Date(), scores: fallbackScores });
  }

  const now = new Date();
  session.timeline.push({ timestamp: now, scores: aiResults.map((r) => r.engagement_score ?? 0) });
  aiResults.forEach((result, idx) => {
    const student = session.students[idx];
    if (!student) return;
    student.engagementTimeline.push({ timestamp: now, score: result.engagement_score, yaw: result.yaw, pitch: result.pitch, eyeOpenness: result.eye_openness, isPresent: result.is_present });
    if (result.engagement_score < 40 && result.is_present) student.attentionDrops.push(now);
  });
  session.save().catch((e) => logger.error("Session save error:", e));
  res.json({ timestamp: now, scores: aiResults.map((r, idx) => ({ studentIndex: idx, engagementScore: r.engagement_score, isPresent: r.is_present, yaw: r.yaw, pitch: r.pitch })) });
});

router.post("/:id/end", requireAuth, async (req, res) => {
  let session;
  try {
    session = await Session.findOne({ _id: req.params.id, tutorId: req.user._id });
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.status === "completed") return res.json({ message: "Already completed" });
  } catch { return res.status(400).json({ error: "Invalid session ID" }); }

  session.endTime = new Date();
  session.status = "completed";
  session.students.forEach((student) => {
    const scores = student.engagementTimeline.map((e) => e.score).filter((s) => s > 0);
    student.averageScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const presentCount = student.engagementTimeline.filter((e) => e.isPresent).length;
    student.attendanceFlag = student.engagementTimeline.length === 0 ? false : presentCount / student.engagementTimeline.length >= 0.2;
  });
  await session.save();
  generateClassSummary(session).then((summary) => { if (summary) Session.findByIdAndUpdate(session._id, { aiSummary: summary }).exec(); }).catch(() => { });
  res.json({ sessionId: session._id, durationSeconds: session.durationSeconds, averageEngagement: session.averageEngagement, studentCount: session.studentCount });
});

router.get("/", requireAuth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 10);

  const sessions = await Session.find(
    {
      tutorId: req.user._id,
      status: { $in: ["live", "completed"] }, // ← include live sessions
    },
    { timeline: 0, "students.engagementTimeline": 0 }
  )
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const total = await Session.countDocuments({
    tutorId: req.user._id,
    status: { $in: ["live", "completed"] },
  });

  res.json({ sessions, total, page, pages: Math.ceil(total / limit) });
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, tutorId: req.user._id }).lean();
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json({ session });
  } catch { res.status(400).json({ error: "Invalid session ID" }); }
});

router.post("/:id/join", async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }

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

  // Check if student with same name already exists — let them rejoin
  const existing = session.students.findIndex(
    (s) => s.name.toLowerCase().trim() === name.toLowerCase().trim()
  );

  if (existing !== -1) {
    // Rejoin existing slot
    return res.json({
      studentIndex: existing,
      name: session.students[existing].name,
      sessionId: session._id,
      rejoined: true,
    });
  }

  // New student — add to session
  session.students.push({
    name: name.trim(),
    engagementTimeline: [],
    attentionDrops: [],
  });
  session.studentCount = session.students.length;
  await session.save();

  const studentIndex = session.students.length - 1;
  res.json({
    studentIndex,
    name: name.trim(),
    sessionId: session._id,
    rejoined: false,
  });
});

module.exports = router;
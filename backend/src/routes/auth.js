const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

function safeUser(user) {
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    plan: user.plan,
    sessionsUsed: user.sessionsUsed,
    subscriptionStatus: user.subscriptionStatus,
    createdAt: user.createdAt,
  };
}

router.post("/register", async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
  try {
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(409).json({ error: "Email already registered" });
    const user = await User.create({ email, passwordHash: password, name: name || "" });
    const token = signToken(user._id);
    res.status(201).json({ token, user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ error: "Registration failed", detail: err.message });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select("+passwordHash");
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = signToken(user._id);
    res.json({ token, user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ error: "Login failed", detail: err.message });
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: {
    id: req.user._id, email: req.user.email, name: req.user.name,
    plan: req.user.plan, sessionsUsed: req.user.sessionsUsed,
    subscriptionStatus: req.user.subscriptionStatus, createdAt: req.user.createdAt,
  }});
});

module.exports = router;

const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  const token = header.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  const user = await User.findById(payload.sub);
  if (!user) return res.status(401).json({ error: "User not found" });
  req.user = user;
  next();
}

function requireCredits(req, res, next) {
  if (!req.user.canStartSession()) {
    return res.status(403).json({
      error: "Session limit reached",
      code: "UPGRADE_REQUIRED",
      sessionsUsed: req.user.sessionsUsed,
      plan: req.user.plan,
    });
  }
  next();
}

module.exports = { requireAuth, requireCredits };

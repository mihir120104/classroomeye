const cron = require("node-cron");
const User = require("../models/User");
const Session = require("../models/Session");
const { sendWeeklyReport } = require("./email");
const logger = require("../utils/logger");

function startWeeklyCron() {
  cron.schedule("0 9 * * 1", async () => {
    logger.info("Weekly report cron started");
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let processed = 0, errors = 0;
    try {
      const activeTutorIds = await Session.distinct("tutorId", { startTime: { $gte: oneWeekAgo }, status: "completed" });
      for (const tutorId of activeTutorIds) {
        try {
          const user = await User.findById(tutorId).lean();
          if (!user) continue;
          const sessions = await Session.find({ tutorId, startTime: { $gte: oneWeekAgo }, status: "completed" }, { timeline: 0, "students.engagementTimeline": 0 }).sort({ startTime: 1 }).lean();
          await sendWeeklyReport({ email: user.email, name: user.name, sessions });
          processed++;
        } catch (err) { errors++; logger.error(`Weekly report failed for ${tutorId}:`, err.message); }
      }
      logger.info(`Weekly reports done — sent: ${processed}, errors: ${errors}`);
    } catch (err) { logger.error("Weekly cron fatal error:", err); }
  });
  logger.info("Weekly report cron scheduled (Mon 09:00)");
}

module.exports = { startWeeklyCron };

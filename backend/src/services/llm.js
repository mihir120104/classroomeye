const axios = require("axios");
const logger = require("../utils/logger");

async function generateClassSummary(session) {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.includes("xxxxxxx")) {
    logger.warn("ANTHROPIC_API_KEY not set — skipping class summary");
    return null;
  }
  const studentSummaries = session.students.map((s, i) => ({
    name: s.name || `Student ${i + 1}`, averageScore: s.averageScore,
    attentionDrops: s.attentionDrops?.length || 0, wasPresent: s.attendanceFlag,
  }));
  const prompt = `You are a teaching assistant summarizing an online class session.
Session data:
- Duration: ${Math.round((session.durationSeconds || 0) / 60)} minutes
- Overall average engagement: ${session.averageEngagement}/100
- Students: ${JSON.stringify(studentSummaries)}
Write exactly 3 sentences: 1) Overall engagement level. 2) Which students struggled. 3) One actionable recommendation. Be direct and specific. No bullet points.`;
  try {
    const { data } = await axios.post("https://api.anthropic.com/v1/messages",
      { model: "claude-haiku-4-5-20251001", max_tokens: 200, messages: [{ role: "user", content: prompt }] },
      { headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }, timeout: 15000 }
    );
    return data?.content?.[0]?.text?.trim() || null;
  } catch (err) {
    logger.warn("LLM summary failed:", err.response?.data || err.message);
    return null;
  }
}

module.exports = { generateClassSummary };

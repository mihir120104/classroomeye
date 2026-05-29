const nodemailer = require("nodemailer");
const logger = require("../utils/logger");

let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({ service: "gmail", auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
  return _transporter;
}

async function sendWeeklyReport({ email, name, sessions }) {
  if (!sessions.length) return;
  const avgEngagement = Math.round(sessions.reduce((sum, s) => sum + (s.averageEngagement || 0), 0) / sessions.length);
  const studentMap = {};
  sessions.forEach((session) => { session.students?.forEach((s) => { if (!studentMap[s.name]) studentMap[s.name] = []; studentMap[s.name].push(s.averageScore || 0); }); });
  const decliningStudents = Object.entries(studentMap).filter(([, scores]) => scores.length >= 2 && scores[scores.length - 1] < scores[0] - 10).map(([name]) => name);
  const engagementLabel = avgEngagement >= 75 ? "strong" : avgEngagement >= 50 ? "moderate" : "low";

  const html = `<div style="font-family:sans-serif;max-width:580px;margin:0 auto;background:#fff;">
    <div style="background:#0f172a;padding:32px;text-align:center;"><h1 style="color:#fff;margin:0;">ClassroomEye Weekly Report</h1></div>
    <div style="padding:32px;">
      <p>Hi ${name || "there"},</p>
      <div style="display:flex;gap:12px;margin:24px 0;">
        <div style="flex:1;background:#f8fafc;border-radius:8px;padding:16px;text-align:center;"><div style="font-size:28px;font-weight:800;">${avgEngagement}</div><div style="font-size:11px;color:#64748b;">AVG ENGAGEMENT</div></div>
        <div style="flex:1;background:#f8fafc;border-radius:8px;padding:16px;text-align:center;"><div style="font-size:28px;font-weight:800;">${sessions.length}</div><div style="font-size:11px;color:#64748b;">SESSIONS</div></div>
        <div style="flex:1;background:#f8fafc;border-radius:8px;padding:16px;text-align:center;"><div style="font-size:28px;font-weight:800;">${engagementLabel}</div><div style="font-size:11px;color:#64748b;">OVERALL</div></div>
      </div>
      ${decliningStudents.length ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px;color:#991b1b;">⚠️ <strong>Attention needed:</strong> ${decliningStudents.join(", ")} showed declining engagement.</div>` : `<p style="background:#dcfce7;padding:12px;border-radius:8px;color:#166534;">✓ No students showed significant decline this week.</p>`}
      ${sessions.map((s) => `<div style="border-left:3px solid #e2e8f0;padding:8px 12px;margin:8px 0;"><div style="font-weight:600;">${new Date(s.startTime).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div><div style="font-size:12px;color:#64748b;">Avg: ${s.averageEngagement}/100 · ${Math.round((s.durationSeconds||0)/60)} min · ${s.studentCount} students</div></div>`).join("")}
    </div>
    <div style="background:#f8fafc;padding:20px;text-align:center;font-size:12px;color:#94a3b8;">ClassroomEye</div>
  </div>`;

  try {
    await getTransporter().sendMail({ from: process.env.EMAIL_FROM, to: email, subject: `Your ClassroomEye weekly report — avg ${avgEngagement}/100`, html });
    logger.info(`Weekly report sent to ${email}`);
  } catch (err) {
    logger.error(`Failed to send report to ${email}:`, err.message);
    throw err;
  }
}

module.exports = { sendWeeklyReport };

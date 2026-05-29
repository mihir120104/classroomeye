const mongoose = require("mongoose");

const StudentSchema = new mongoose.Schema(
  {
    name: { type: String, default: "Student" },
    engagementTimeline: [{ timestamp: Date, score: Number, yaw: Number, pitch: Number, eyeOpenness: Number, isPresent: Boolean }],
    averageScore: { type: Number, default: 0 },
    attentionDrops: [{ type: Date }],
    attendanceFlag: { type: Boolean, default: true },
  },
  { _id: false }
);

const SessionSchema = new mongoose.Schema(
  {
    tutorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date, default: null },
    durationSeconds: { type: Number, default: 0 },
    studentCount: { type: Number, default: 0 },
    students: [StudentSchema],
    timeline: [{ timestamp: Date, scores: [Number], _id: false }],
    averageEngagement: { type: Number, default: 0 },
    aiSummary: { type: String, default: null },
    status: { type: String, enum: ["live", "completed", "error"], default: "live" },
  },
  { timestamps: true }
);

SessionSchema.pre("save", function (next) {
  if (this.timeline && this.timeline.length > 0) {
    const allScores = this.timeline.flatMap((t) => t.scores);
    if (allScores.length > 0) {
      this.averageEngagement = Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length);
    }
  }
  if (this.endTime && this.startTime) {
    this.durationSeconds = Math.round((this.endTime - this.startTime) / 1000);
  }
  next();
});

module.exports = mongoose.model("Session", SessionSchema);

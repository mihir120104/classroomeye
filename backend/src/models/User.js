const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, trim: true, default: "" },
    plan: { type: String, enum: ["free", "paid"], default: "free" },
    sessionsUsed: { type: Number, default: 0 },
    stripeCustomerId: { type: String, default: null },
    stripeSubscriptionId: { type: String, default: null },
    subscriptionStatus: { type: String, enum: ["active", "canceled", "past_due", "none"], default: "none" },
    paidUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

UserSchema.pre("save", async function (next) {
  if (!this.isModified("passwordHash")) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

UserSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

UserSchema.methods.canStartSession = function () {
  if (this.plan === "paid") {
    if (this.subscriptionStatus === "canceled" && this.paidUntil) {
      return new Date() < new Date(this.paidUntil);
    }
    return this.subscriptionStatus === "active";
  }
  return this.sessionsUsed < 5;
};

module.exports = mongoose.model("User", UserSchema);

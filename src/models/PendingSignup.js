// backend/src/models/PendingSignup.js
const mongoose = require("mongoose");

const PendingSignupSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, unique: true, index: true },
    name: { type: String, default: "" },
    passwordHash: { type: String, required: true },

    otpHash: { type: String, required: true },
    otpExpiresAt: { type: Date, required: true, index: true },

    attemptsLeft: { type: Number, default: 5 },
    lastSentAt: { type: Date },
  },
  { timestamps: true }
);

// Auto delete after expiry time
PendingSignupSchema.index({ otpExpiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("PendingSignup", PendingSignupSchema);

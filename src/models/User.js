const mongoose = require('mongoose');
const { ROLES } = require('../config/constants');

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    role: { type: String, enum: Object.values(ROLES), required: true },
    isActive: { type: Boolean, default: true },

    // ✅ Forgot password / OTP reset
    forgotOtpHash: { type: String },
    forgotOtpExpiresAt: { type: Date },
    forgotOtpAttempts: { type: Number, default: 0 },
    forgotOtpLastSentAt: { type: Date },

    passwordResetTokenHash: { type: String },
    passwordResetExpiresAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);

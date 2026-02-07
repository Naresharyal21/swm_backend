const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const env = require('../config/env');
const User = require('../models/User');
const { sendOtpEmail } = require('../utils/mailer');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function genOtp6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

// POST /api/auth/forgot-password
exports.forgotPassword = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!email) return res.status(400).json({ message: 'Email is required' });

  const user = await User.findOne({ email });

  // ✅ Always respond ok to avoid user enumeration
  if (!user) return res.json({ ok: true });

  // ✅ resend cooldown
  const cooldownSec = Number(env.otp?.resendCooldownSec ?? 60);
  if (user.forgotOtpLastSentAt) {
    const seconds = (Date.now() - user.forgotOtpLastSentAt.getTime()) / 1000;
    if (seconds < cooldownSec) {
      return res.status(429).json({
        message: `Please wait ${Math.ceil(cooldownSec - seconds)}s before requesting a new OTP.`,
      });
    }
  }

  const otp = genOtp6();
  const ttlMin = Number(env.otp?.ttlMin ?? 10);

  user.forgotOtpHash = sha256(otp);
  user.forgotOtpExpiresAt = new Date(Date.now() + ttlMin * 60 * 1000);
  user.forgotOtpAttempts = 0;
  user.forgotOtpLastSentAt = new Date();

  // invalidate older reset token
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;

  await user.save();

  // send email
  await sendOtpEmail({ to: email, otp });

  return res.json({ ok: true });
};

// POST /api/auth/verify-otp
exports.verifyOtp = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const otp = String(req.body.otp || '').trim();

  if (!email || !otp) {
    return res.status(400).json({ message: 'Email and OTP are required' });
  }

  const user = await User.findOne({ email });

  // ✅ If user or OTP fields missing → invalid
  if (!user || !user.forgotOtpHash || !user.forgotOtpExpiresAt) {
    console.log('[verifyOtp] missing user/otp fields', {
      email,
      foundUser: !!user,
      hasHash: !!user?.forgotOtpHash,
      hasExp: !!user?.forgotOtpExpiresAt,
    });
    return res.status(400).json({ message: 'Invalid OTP' });
  }

  // ✅ Debug logs (now reachable)
  console.log('[verifyOtp]', {
    email,
    otpLen: otp.length,
    hasHash: !!user.forgotOtpHash,
    expiresAt: user.forgotOtpExpiresAt,
  });
  console.log('[verifyOtp] computed=', sha256(otp));
  console.log('[verifyOtp] stored  =', user.forgotOtpHash);

  // attempts limiter
  user.forgotOtpAttempts = Number(user.forgotOtpAttempts || 0) + 1;
  if (user.forgotOtpAttempts > 8) {
    await user.save();
    return res.status(429).json({ message: 'Too many attempts. Please request a new OTP.' });
  }

  if (user.forgotOtpExpiresAt.getTime() < Date.now()) {
    await user.save();
    return res.status(400).json({ message: 'OTP expired. Please request a new OTP.' });
  }

  if (sha256(otp) !== user.forgotOtpHash) {
    await user.save();
    return res.status(400).json({ message: 'Invalid OTP' });
  }

  // ✅ OTP correct → create short-lived reset token (JWT)
  if (!env.jwt?.resetSecret) {
    return res.status(500).json({ message: 'Server missing JWT_RESET_SECRET' });
  }

  const ttlMin = Number(env.jwt?.resetTtlMin ?? 10);

  const resetToken = jwt.sign(
    { sub: String(user._id), email },
    env.jwt.resetSecret,
    { expiresIn: `${ttlMin}m` }
  );

  user.passwordResetTokenHash = sha256(resetToken);
  user.passwordResetExpiresAt = new Date(Date.now() + ttlMin * 60 * 1000);

  // ✅ one-time OTP use
  user.forgotOtpHash = undefined;
  user.forgotOtpExpiresAt = undefined;
  user.forgotOtpAttempts = 0;

  await user.save();

  return res.json({ ok: true, resetToken });
};

// POST /api/auth/reset-password
exports.resetPassword = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const resetToken = String(req.body.resetToken || '');
  const newPassword = String(req.body.newPassword || '');

  if (!email || !resetToken || !newPassword) {
    return res.status(400).json({ message: 'Email, resetToken, and newPassword are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Minimum 6 characters' });
  }

  const user = await User.findOne({ email });
  if (!user || !user.passwordResetTokenHash || !user.passwordResetExpiresAt) {
    return res.status(400).json({ message: 'Invalid reset token' });
  }

  if (user.passwordResetExpiresAt.getTime() < Date.now()) {
    return res.status(400).json({ message: 'Reset token expired. Please request OTP again.' });
  }

  if (sha256(resetToken) !== user.passwordResetTokenHash) {
    return res.status(400).json({ message: 'Invalid reset token' });
  }

  // verify signature + expiry
  try {
    jwt.verify(resetToken, env.jwt.resetSecret);
  } catch {
    return res.status(400).json({ message: 'Invalid reset token' });
  }

  // update password
  user.passwordHash = await bcrypt.hash(newPassword, 10);

  // clear reset token
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;

  await user.save();

  return res.json({ ok: true });
};

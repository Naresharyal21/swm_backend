const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const PendingSignup = require("../models/PendingSignup");
const User = require("../models/User");

// ✅ reuse your existing mail sender
const { sendOtpEmail } = require("../utils/mailer");

const SIGNUP_OTP_TTL_SEC = Number(process.env.SIGNUP_OTP_TTL_SEC || 60); // 1 minute
const SIGNUP_OTP_RESEND_COOLDOWN_SEC = Number(process.env.SIGNUP_OTP_RESEND_COOLDOWN_SEC || 15);
const SIGNUP_OTP_ATTEMPTS = Number(process.env.SIGNUP_OTP_ATTEMPTS || 5);

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}
function otp6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
function sha256(v) {
  return crypto.createHash("sha256").update(String(v)).digest("hex");
}
function secondsBetween(nowDate, pastDate) {
  return Math.floor((nowDate.getTime() - pastDate.getTime()) / 1000);
}

async function requestOtp(req, res) {
  try {
    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!email || !password) return res.status(400).json({ message: "Email and password required" });
    if (password.length < 6) return res.status(400).json({ message: "Minimum 6 characters password" });

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: "Email already registered" });

    const prev = await PendingSignup.findOne({ email });
    if (prev?.lastSentAt) {
      const diff = secondsBetween(new Date(), new Date(prev.lastSentAt));
      const wait = SIGNUP_OTP_RESEND_COOLDOWN_SEC - diff;
      if (wait > 0) {
        return res.status(429).json({ message: `Please wait ${wait}s before requesting a new OTP.` });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const otp = otp6();
    const otpHash = sha256(otp);
    const otpExpiresAt = new Date(Date.now() + SIGNUP_OTP_TTL_SEC * 1000);

    await PendingSignup.findOneAndUpdate(
      { email },
      {
        email,
        name,
        passwordHash,
        otpHash,
        otpExpiresAt,
        attemptsLeft: SIGNUP_OTP_ATTEMPTS,
        lastSentAt: new Date(),
      },
      { upsert: true, new: true }
    );

    // ✅ Signup email subject + 1 minute text
    await sendOtpEmail({ to: email, otp, purpose: "Signup", ttlText: "1 minute" });

    return res.json({
      ok: true,
      message: "OTP sent to your email.",
      expiresInSeconds: SIGNUP_OTP_TTL_SEC,
    });
  } catch (e) {
    console.error("signupOtp.requestOtp error:", e);
    return res.status(500).json({ message: "Failed to send OTP" });
  }
}

async function verifyOtp(req, res) {
  try {
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.otp || "").trim();

    if (!email || !code) return res.status(400).json({ message: "Email and OTP required" });

    const pending = await PendingSignup.findOne({ email });
    if (!pending) return res.status(400).json({ message: "OTP not found or expired. Please request again." });

    if (new Date(pending.otpExpiresAt).getTime() < Date.now()) {
      await PendingSignup.deleteOne({ _id: pending._id });
      return res.status(400).json({ message: "OTP expired. Please request again." });
    }

    const attemptsLeft = Number(pending.attemptsLeft ?? 0);
    if (attemptsLeft <= 0) {
      await PendingSignup.deleteOne({ _id: pending._id });
      return res.status(429).json({ message: "Too many attempts. Process ended. Please request OTP again." });
    }

    if (sha256(code) !== pending.otpHash) {
      pending.attemptsLeft = attemptsLeft - 1;
      await pending.save();

      if (pending.attemptsLeft <= 0) {
        await PendingSignup.deleteOne({ _id: pending._id });
        return res.status(429).json({ message: "Too many attempts. Process ended. Please request OTP again." });
      }

      return res.status(400).json({ message: `Invalid OTP. Attempts left: ${pending.attemptsLeft}` });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      await PendingSignup.deleteOne({ _id: pending._id });
      return res.json({ ok: true, message: "Already registered. Please login." });
    }

    const user = await User.create({
      email,
      name: pending.name || "",
      passwordHash: pending.passwordHash,
      emailVerified: true,
      role: "CITIZEN", // ✅ required by your schema (change to "citizen" if needed)
    });

    await PendingSignup.deleteOne({ _id: pending._id });

    return res.json({
      ok: true,
      message: "Signup successful",
      user: { id: user._id, email: user.email, name: user.name, role: user.role },
    });
  } catch (e) {
    console.error("signupOtp.verifyOtp error:", e);
    return res.status(500).json({ message: "Failed to verify OTP" });
  }
}

async function cancel(req, res) {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email) return res.status(400).json({ message: "Email required" });

    await PendingSignup.deleteOne({ email });
    return res.json({ ok: true, message: "Signup cancelled" });
  } catch (e) {
    console.error("signupOtp.cancel error:", e);
    return res.status(500).json({ message: "Failed to cancel signup" });
  }
}

module.exports = { requestOtp, verifyOtp, cancel };

const nodemailer = require("nodemailer");
const env = require("../config/env");

const transporter = nodemailer.createTransport({
  host: env.smtp.host,
  port: Number(env.smtp.port || 587),
  secure: Number(env.smtp.port) === 465,
  auth: { user: env.smtp.user, pass: env.smtp.pass },
});

/**
 * Backward-compatible OTP mailer:
 * - Forgot password: sendOtpEmail({ to, otp }) -> "Password Reset" + env.otp.ttlMin minutes
 * - Signup: sendOtpEmail({ to, otp, purpose: "Signup", ttlText: "1 minute" }) -> custom
 */
async function sendOtpEmail({ to, otp, purpose = "Password Reset", ttlText }) {
  const expiryText = ttlText || `${env.otp.ttlMin} minutes`;

  await transporter.sendMail({
    from: env.smtp.from || env.smtp.user,
    to,
    subject: `${purpose} OTP - Smart Waste`,
    text: `Your OTP is: ${otp}\n\nIt expires in ${expiryText}.`,
  });
}

module.exports = { sendOtpEmail };

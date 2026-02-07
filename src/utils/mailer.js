const nodemailer = require('nodemailer');
const env = require('../config/env');

const transporter = nodemailer.createTransport({
  host: env.smtp.host,
  port: Number(env.smtp.port || 587),
  secure: Number(env.smtp.port) === 465,
  auth: { user: env.smtp.user, pass: env.smtp.pass },
});

async function sendOtpEmail({ to, otp }) {
  await transporter.sendMail({
    from: env.smtp.from || env.smtp.user,
    to,
    subject: 'Password Reset OTP - Smart Waste',
    text: `Your OTP is: ${otp}\n\nIt expires in ${env.otp.ttlMin} minutes.`,
  });
}

module.exports = { sendOtpEmail };

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const dayjs = require('dayjs');
const env = require('../config/env');
const RefreshToken = require('../models/RefreshToken');
const { sha256 } = require('../utils/crypto');
const { unauthorized } = require('../utils/errors');

function signAccessToken(user) {
  return jwt.sign(
    { role: user.role },
    env.jwt.accessSecret,
    { subject: String(user._id), expiresIn: env.jwt.accessExpiresIn }
  );
}

async function issueRefreshToken(userId) {
  const raw = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256(raw);
  const expiresAt = dayjs().add(7, 'day').toDate();

  await RefreshToken.create({ userId, tokenHash, expiresAt });

  return { raw, expiresAt };
}

async function rotateRefreshToken(rawToken) {
  const tokenHash = sha256(rawToken);
  const record = await RefreshToken.findOne({ tokenHash });
  if (!record) throw unauthorized('Invalid refresh token');
  if (record.revokedAt) throw unauthorized('Refresh token revoked');
  if (record.expiresAt < new Date()) throw unauthorized('Refresh token expired');

  const newRaw = crypto.randomBytes(32).toString('hex');
  const newHash = sha256(newRaw);

  // Mark old as revoked and linked
  record.revokedAt = new Date();
  record.replacedByTokenHash = newHash;
  await record.save();

  const expiresAt = dayjs().add(7, 'day').toDate();
  await RefreshToken.create({ userId: record.userId, tokenHash: newHash, expiresAt });

  return { userId: record.userId, newRaw, expiresAt };
}

async function revokeRefreshToken(rawToken) {
  if (!rawToken) return;
  const tokenHash = sha256(rawToken);
  await RefreshToken.updateOne({ tokenHash }, { $set: { revokedAt: new Date() } });
}

module.exports = {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken
};

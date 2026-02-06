const asyncHandler = require('../utils/asyncHandler');
const { registerCitizen, login } = require('../services/authService');
const { signAccessToken, issueRefreshToken, rotateRefreshToken, revokeRefreshToken } = require('../services/tokenService');
const { audit } = require('../services/auditService');

const register = asyncHandler(async (req, res) => {
  const user = await registerCitizen(req.body);
  const accessToken = signAccessToken(user);
  const { raw: refreshToken, expiresAt } = await issueRefreshToken(user._id);
  await audit({ actorUserId: user._id, action: 'AUTH_REGISTER', entityType: 'User', entityId: user._id, req });
  res.status(201).json({ accessToken, refreshToken, refreshExpiresAt: expiresAt, user: { id: user._id, email: user.email, role: user.role, name: user.name } });
});

const loginController = asyncHandler(async (req, res) => {
  const user = await login(req.body);
  const accessToken = signAccessToken(user);
  const { raw: refreshToken, expiresAt } = await issueRefreshToken(user._id);
  await audit({ actorUserId: user._id, action: 'AUTH_LOGIN', entityType: 'User', entityId: user._id, req });
  res.json({ accessToken, refreshToken, refreshExpiresAt: expiresAt, user: { id: user._id, email: user.email, role: user.role, name: user.name } });
});

const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  const { userId, newRaw, expiresAt } = await rotateRefreshToken(refreshToken);
  const user = { _id: userId, role: req.body.roleHint || 'CITIZEN' };
  // Fetch role for correctness
  const User = require('../models/User');
  const dbUser = await User.findById(userId).lean();
  const accessToken = signAccessToken(dbUser);
  await audit({ actorUserId: userId, action: 'AUTH_REFRESH', entityType: 'User', entityId: userId, req });
  res.json({ accessToken, refreshToken: newRaw, refreshExpiresAt: expiresAt });
});

const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  await revokeRefreshToken(refreshToken);
  await audit({ actorUserId: req.user?._id || null, action: 'AUTH_LOGOUT', entityType: 'User', entityId: req.user?._id || null, req });
  res.json({ status: 'ok' });
});

const me = asyncHandler(async (req, res) => {
  res.json({ user: { id: req.user._id, email: req.user.email, role: req.user.role, name: req.user.name } });
});

module.exports = { register, loginController, refresh, logout, me };

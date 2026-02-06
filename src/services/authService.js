const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { ROLES } = require('../config/constants');
const { badRequest, unauthorized } = require('../utils/errors');

async function registerCitizen({ email, password, name, phone }) {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw badRequest('Email already registered');
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ email: email.toLowerCase(), passwordHash, name: name || '', phone: phone || '', role: ROLES.CITIZEN });
  return user;
}

async function login({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !user.isActive) throw unauthorized('Invalid credentials');
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw unauthorized('Invalid credentials');
  return user;
}

async function createUserAsAdmin({ email, password, name, phone, role }) {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw badRequest('Email already registered');
  if (!Object.values(ROLES).includes(role)) throw badRequest('Invalid role');
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ email: email.toLowerCase(), passwordHash, name: name || '', phone: phone || '', role });
  return user;
}

module.exports = { registerCitizen, login, createUserAsAdmin };

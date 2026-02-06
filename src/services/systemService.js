const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { ROLES } = require('../config/constants');

async function getOrCreateSystemUser() {
  const email = 'system@local';
  let user = await User.findOne({ email }).lean();
  if (user) return user;
  const passwordHash = await bcrypt.hash('system_password_change_me', 10);
  user = await User.create({ email, passwordHash, name: 'System', role: ROLES.ADMIN, isActive: true });
  return user.toObject();
}

module.exports = { getOrCreateSystemUser };

const mongoose = require('mongoose');
const { ROLES } = require('../config/constants');

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    role: { type: String, enum: Object.values(ROLES), required: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);

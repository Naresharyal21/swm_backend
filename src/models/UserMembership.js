const mongoose = require('mongoose');

const UserMembershipSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'MembershipPlan', required: true, index: true },
    status: { type: String, enum: ['ACTIVE', 'CANCELLED'], default: 'ACTIVE', index: true },
    startedAt: { type: Date, default: () => new Date() },
    cancelledAt: { type: Date, default: null },
    note: { type: String, default: '' }
  },
  { timestamps: true }
);

UserMembershipSchema.index(
  { userId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE' } }
);

module.exports = mongoose.model('UserMembership', UserMembershipSchema);

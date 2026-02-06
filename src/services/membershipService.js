const MembershipPlan = require('../models/MembershipPlan');
const UserMembership = require('../models/UserMembership');

async function listMembershipPlans() {
  return MembershipPlan.find({ isActive: true }).sort({ monthlyFee: 1 }).lean();
}

async function getActiveMembership(userId) {
  const membership = await UserMembership.findOne({ userId, status: 'ACTIVE' }).lean();
  if (!membership) return null;
  const plan = await MembershipPlan.findById(membership.planId).lean();
  if (!plan || !plan.isActive) return null;
  return { membership, plan };
}

async function subscribeToMembership({ userId, planId }) {
  // Replace existing active membership
  await UserMembership.updateMany({ userId, status: 'ACTIVE' }, { $set: { status: 'CANCELLED', cancelledAt: new Date(), note: 'Auto-cancel on re-subscribe' } });

  const plan = await MembershipPlan.findById(planId).lean();
  if (!plan || !plan.isActive) throw new Error('Membership plan not found or inactive');

  const membership = await UserMembership.create({ userId, planId, status: 'ACTIVE', startedAt: new Date() });
  return { membership, plan };
}

async function cancelMembership({ userId, note = '' }) {
  const membership = await UserMembership.findOne({ userId, status: 'ACTIVE' });
  if (!membership) return null;
  membership.status = 'CANCELLED';
  membership.cancelledAt = new Date();
  membership.note = note;
  await membership.save();
  return membership;
}

module.exports = {
  listMembershipPlans,
  getActiveMembership,
  subscribeToMembership,
  cancelMembership
};

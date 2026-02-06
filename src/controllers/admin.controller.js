// src/controllers/admin.controller.js

const asyncHandler = require('../utils/asyncHandler');
const { createUserAsAdmin } = require('../services/authService');
const { audit } = require('../services/auditService');

const User = require('../models/User');
const Zone = require('../models/Zone');
const Household = require('../models/Household');
const Bin = require('../models/Bin');
const VirtualBin = require('../models/VirtualBin');
const VirtualBinMember = require('../models/VirtualBinMember');
const Vehicle = require('../models/Vehicle');
const BillingPlan = require('../models/BillingPlan');
const RewardRate = require('../models/RewardRate');
const MembershipPlan = require('../models/MembershipPlan');

const { notFound, badRequest } = require('../utils/errors');

// --------------------
// Users
// --------------------

const createUser = asyncHandler(async (req, res) => {
  const user = await createUserAsAdmin(req.body);

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_CREATE_USER',
    entityType: 'User',
    entityId: user._id,
    meta: { role: user.role },
    req
  });

  res.status(201).json({
    id: user._id,
    email: user.email,
    role: user.role,
    name: user.name,
    phone: user.phone
  });
});

const listUsers = asyncHandler(async (req, res) => {
  const items = await User.find()
    .select('_id email role name phone isActive createdAt')
    .sort({ createdAt: -1 })
    .lean();

  res.json({ items });
});

// ✅ Admin UPDATE user (name/phone/isActive/role)
const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Optional: block editing ADMIN users entirely (uncomment if you want)
  // const target = await User.findById(id).select('_id role').lean();
  // if (!target) throw notFound('User not found');
  // if (target.role === 'ADMIN') throw badRequest('Cannot update ADMIN user');

  const allowed = ['name', 'phone', 'isActive', 'role'];
  const patch = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) patch[k] = req.body[k];
  }

  // Optional: block promoting someone to ADMIN (uncomment if you want)
  // if (patch.role === 'ADMIN') throw badRequest('Cannot promote to ADMIN');

  const user = await User.findByIdAndUpdate(id, patch, { new: true })
    .select('_id email role name phone isActive createdAt')
    .lean();

  if (!user) throw notFound('User not found');

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_UPDATE_USER',
    entityType: 'User',
    entityId: user._id,
    meta: { patch },
    req
  });

  res.json({ user });
});


// ✅ Admin DELETE user (ALLOW deleting ADMIN too; but cannot delete self)
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id).select('_id email role').lean();
  if (!user) throw notFound('User not found');

  // ✅ keep this safety: prevent self-delete
  if (String(user._id) === String(req.user._id)) {
    throw badRequest('You cannot delete your own account');
  }

  // ✅ allow deleting ADMIN as well
  await User.deleteOne({ _id: id });

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_DELETE_USER',
    entityType: 'User',
    entityId: id,
    meta: { role: user.role },
    req
  });

  res.json({ status: 'ok' });
});

// --------------------
// Zones
// --------------------

const createZone = asyncHandler(async (req, res) => {
  const zone = await Zone.create(req.body);

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_CREATE_ZONE',
    entityType: 'Zone',
    entityId: zone._id,
    req
  });

  res.status(201).json({ zone });
});

const listZones = asyncHandler(async (req, res) => {
  const items = await Zone.find().sort({ createdAt: -1 }).lean();
  res.json({ items });
});

const updateZone = asyncHandler(async (req, res) => {
  const zone = await Zone.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
  if (!zone) throw notFound('Zone not found');

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_UPDATE_ZONE',
    entityType: 'Zone',
    entityId: zone._id,
    req
  });

  res.json({ zone });
});

const deleteZone = asyncHandler(async (req, res) => {
  const zone = await Zone.findByIdAndDelete(req.params.id).lean();
  if (!zone) throw notFound('Zone not found');

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_DELETE_ZONE',
    entityType: 'Zone',
    entityId: zone._id,
    req
  });

  res.json({ status: 'ok' });
});

// --------------------
// Households
// --------------------

const createHousehold = asyncHandler(async (req, res) => {
  const household = await Household.create(req.body);

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_CREATE_HOUSEHOLD',
    entityType: 'Household',
    entityId: household._id,
    req
  });

  res.status(201).json({ household });
});

const listHouseholds = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.zoneId) q.zoneId = req.query.zoneId;

  const items = await Household.find(q).sort({ createdAt: -1 }).lean();
  res.json({ items });
});

// --------------------
// Bins
// --------------------

const createBin = asyncHandler(async (req, res) => {
  const household = await Household.findById(req.body.householdId).lean();
  if (!household) throw notFound('Household not found');

  const bin = await Bin.create({ ...req.body, location: req.body.location || household.location });

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_CREATE_BIN',
    entityType: 'Bin',
    entityId: bin._id,
    req
  });

  res.status(201).json({ bin });
});

const listBins = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.householdId) q.householdId = req.query.householdId;
  if (req.query.virtualBinId) q.virtualBinId = req.query.virtualBinId;

  const items = await Bin.find(q).sort({ createdAt: -1 }).lean();
  res.json({ items });
});

// --------------------
// Virtual Bins
// --------------------

const createVirtualBin = asyncHandler(async (req, res) => {
  const vb = await VirtualBin.create(req.body);

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_CREATE_VIRTUAL_BIN',
    entityType: 'VirtualBin',
    entityId: vb._id,
    req
  });

  res.status(201).json({ virtualBin: vb });
});

const listVirtualBins = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.zoneId) q.zoneId = req.query.zoneId;

  const items = await VirtualBin.find(q).sort({ createdAt: -1 }).lean();
  res.json({ items });
});

const setVirtualBinMembers = asyncHandler(async (req, res) => {
  const { binIds } = req.body;

  const vb = await VirtualBin.findById(req.params.id).lean();
  if (!vb) throw notFound('Virtual bin not found');

  await VirtualBinMember.deleteMany({ virtualBinId: vb._id });

  const docs = (binIds || []).map((binId) => ({ virtualBinId: vb._id, binId }));
  if (docs.length) {
    await VirtualBinMember.insertMany(docs);
    await Bin.updateMany({ _id: { $in: binIds } }, { $set: { virtualBinId: vb._id } });
  }

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_SET_VIRTUAL_BIN_MEMBERS',
    entityType: 'VirtualBin',
    entityId: vb._id,
    meta: { count: (binIds || []).length },
    req
  });

  res.json({ status: 'ok', count: (binIds || []).length });
});

// --------------------
// Vehicles
// --------------------

const createVehicle = asyncHandler(async (req, res) => {
  const v = await Vehicle.create(req.body);

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_CREATE_VEHICLE',
    entityType: 'Vehicle',
    entityId: v._id,
    req
  });

  res.status(201).json({ vehicle: v });
});

const listVehicles = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.vehicleType) q.vehicleType = req.query.vehicleType;

  const items = await Vehicle.find(q).sort({ createdAt: -1 }).lean();
  res.json({ items });
});

// --------------------
// Billing Plans
// --------------------

const createBillingPlan = asyncHandler(async (req, res) => {
  const plan = await BillingPlan.create(req.body);

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_CREATE_BILLING_PLAN',
    entityType: 'BillingPlan',
    entityId: plan._id,
    req
  });

  res.status(201).json({ plan });
});

const listBillingPlans = asyncHandler(async (req, res) => {
  const items = await BillingPlan.find().sort({ createdAt: -1 }).lean();
  res.json({ items });
});

// --------------------
// Reward Rates
// --------------------

const createRewardRate = asyncHandler(async (req, res) => {
  const existing = await RewardRate.findOne({ category: req.body.category }).lean();
  if (existing) throw badRequest('Category already exists');

  const rate = await RewardRate.create(req.body);

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_CREATE_REWARD_RATE',
    entityType: 'RewardRate',
    entityId: rate._id,
    req
  });

  res.status(201).json({ rate });
});

const listRewardRates = asyncHandler(async (req, res) => {
  const items = await RewardRate.find().sort({ createdAt: -1 }).lean();
  res.json({ items });
});

// --------------------
// Membership Plans
// --------------------

const createMembershipPlan = asyncHandler(async (req, res) => {
  const plan = await MembershipPlan.create(req.body);

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_CREATE_MEMBERSHIP_PLAN',
    entityType: 'MembershipPlan',
    entityId: plan._id,
    req
  });

  res.status(201).json({ plan });
});

const listMembershipPlans = asyncHandler(async (req, res) => {
  const items = await MembershipPlan.find().sort({ createdAt: -1 }).lean();
  res.json({ items });
});

const updateMembershipPlan = asyncHandler(async (req, res) => {
  const plan = await MembershipPlan.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
  if (!plan) throw notFound('Membership plan not found');

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_UPDATE_MEMBERSHIP_PLAN',
    entityType: 'MembershipPlan',
    entityId: plan._id,
    req
  });

  res.json({ plan });
});

const deactivateMembershipPlan = asyncHandler(async (req, res) => {
  const plan = await MembershipPlan.findById(req.params.id);
  if (!plan) throw notFound('Membership plan not found');

  plan.isActive = false;
  await plan.save();

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_DEACTIVATE_MEMBERSHIP_PLAN',
    entityType: 'MembershipPlan',
    entityId: plan._id,
    req
  });

  res.json({ plan });
});

// --------------------
// Exports
// --------------------

module.exports = {
  createUser,
  listUsers,
  updateUser,
  deleteUser,

  createZone,
  listZones,
  updateZone,
  deleteZone,

  createHousehold,
  listHouseholds,

  createBin,
  listBins,

  createVirtualBin,
  listVirtualBins,
  setVirtualBinMembers,

  createVehicle,
  listVehicles,

  createBillingPlan,
  listBillingPlans,

  createRewardRate,
  listRewardRates,

  createMembershipPlan,
  listMembershipPlans,
  updateMembershipPlan,
  deactivateMembershipPlan
};

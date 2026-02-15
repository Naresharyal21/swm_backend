// src/controllers/admin.controller.js

const asyncHandler = require('../utils/asyncHandler')
const { createUserAsAdmin } = require('../services/authService')
const { audit } = require('../services/auditService')

const User = require('../models/User')
const Zone = require('../models/Zone')
const Household = require('../models/Household')
const Bin = require('../models/Bin')
const VirtualBin = require('../models/VirtualBin')
const VirtualBinMember = require('../models/VirtualBinMember')
const Vehicle = require('../models/Vehicle')
const BillingPlan = require('../models/BillingPlan')
const RewardRate = require('../models/RewardRate')
const MembershipPlan = require('../models/MembershipPlan')

const { notFound, badRequest } = require('../utils/errors')

// --------------------
// Users
// --------------------

const createUser = asyncHandler(async (req, res) => {
  const user = await createUserAsAdmin(req.body)

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_CREATE_USER',
    entityType: 'User',
    entityId: user._id,
    meta: { role: user.role },
    req
  })

  res.status(201).json({
    id: user._id,
    email: user.email,
    role: user.role,
    name: user.name,
    phone: user.phone
  })
})

const listUsers = asyncHandler(async (req, res) => {
  const items = await User.find()
    .select('_id email role name phone isActive createdAt')
    .sort({ createdAt: -1 })
    .lean()

  res.json({ items })
})

const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params

  const allowed = ['name', 'phone', 'isActive', 'role']
  const patch = {}
  for (const k of allowed) {
    if (req.body[k] !== undefined) patch[k] = req.body[k]
  }

  const user = await User.findByIdAndUpdate(id, patch, { new: true })
    .select('_id email role name phone isActive createdAt')
    .lean()

  if (!user) throw notFound('User not found')

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_UPDATE_USER',
    entityType: 'User',
    entityId: user._id,
    meta: { patch },
    req
  })

  res.json({ user })
})

const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params

  const user = await User.findById(id).select('_id email role').lean()
  if (!user) throw notFound('User not found')

  if (String(user._id) === String(req.user._id)) {
    throw badRequest('You cannot delete your own account')
  }

  await User.deleteOne({ _id: id })

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_DELETE_USER',
    entityType: 'User',
    entityId: id,
    meta: { role: user.role },
    req
  })

  res.json({ status: 'ok' })
})

// --------------------
// Zones
// --------------------

const createZone = asyncHandler(async (req, res) => {
  const zone = await Zone.create(req.body)

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_CREATE_ZONE',
    entityType: 'Zone',
    entityId: zone._id,
    req
  })

  res.status(201).json({ zone })
})

const listZones = asyncHandler(async (req, res) => {
  const items = await Zone.find().sort({ createdAt: -1 }).lean()
  res.json({ items })
})

const getZoneById = asyncHandler(async (req, res) => {
  const zone = await Zone.findById(req.params.id).lean()
  if (!zone) throw notFound('Zone not found')
  res.json({ zone })
})

const updateZone = asyncHandler(async (req, res) => {
  const zone = await Zone.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  }).lean()
  if (!zone) throw notFound('Zone not found')

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_UPDATE_ZONE',
    entityType: 'Zone',
    entityId: zone._id,
    req
  })

  res.json({ zone })
})

const deleteZone = asyncHandler(async (req, res) => {
  const zone = await Zone.findByIdAndDelete(req.params.id).lean()
  if (!zone) throw notFound('Zone not found')

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_DELETE_ZONE',
    entityType: 'Zone',
    entityId: zone._id,
    req
  })

  res.json({ status: 'ok' })
})

// --------------------
// Households
// --------------------

const createHousehold = asyncHandler(async (req, res) => {
  const household = await Household.create(req.body)

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_CREATE_HOUSEHOLD',
    entityType: 'Household',
    entityId: household._id,
    req
  })

  res.status(201).json({ household })
})

const listHouseholds = asyncHandler(async (req, res) => {
  const q = {}
  if (req.query.zoneId) q.zoneId = req.query.zoneId
  if (req.query.citizenUserId) q.citizenUserId = req.query.citizenUserId
  if (req.query.planId) q.planId = req.query.planId

  const items = await Household.find(q).sort({ createdAt: -1 }).lean()
  res.json({ items })
})

const getHouseholdById = asyncHandler(async (req, res) => {
  const household = await Household.findById(req.params.id).lean()
  if (!household) throw notFound('Household not found')
  res.json({ household })
})

const updateHousehold = asyncHandler(async (req, res) => {
  const { id } = req.params

  const allowed = [
    'zoneId',
    'citizenUserId',
    'address',
    'location',
    'planId',
    'pickupScheduleDays'
  ]
  const patch = {}
  for (const k of allowed) {
    if (req.body[k] !== undefined) patch[k] = req.body[k]
  }

  const household = await Household.findByIdAndUpdate(id, patch, {
    new: true,
    runValidators: true
  }).lean()
  if (!household) throw notFound('Household not found')

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_UPDATE_HOUSEHOLD',
    entityType: 'Household',
    entityId: household._id,
    meta: { patch },
    req
  })

  res.json({ household })
})

const deleteHousehold = asyncHandler(async (req, res) => {
  const { id } = req.params

  const household = await Household.findByIdAndDelete(id).lean()
  if (!household) throw notFound('Household not found')

  // optional: remove bins for this household
  // await Bin.deleteMany({ householdId: household._id })

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_DELETE_HOUSEHOLD',
    entityType: 'Household',
    entityId: id,
    req
  })

  res.json({ status: 'ok' })
})

// --------------------
// Bins
// --------------------

const createBin = asyncHandler(async (req, res) => {
  const household = await Household.findById(req.body.householdId).lean()
  if (!household) throw notFound('Household not found')

  const bin = await Bin.create({ ...req.body, location: req.body.location || household.location })

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_CREATE_BIN',
    entityType: 'Bin',
    entityId: bin._id,
    req
  })

  res.status(201).json({ bin })
})

const listBins = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.householdId) q.householdId = req.query.householdId;
  if (req.query.virtualBinId) q.virtualBinId = req.query.virtualBinId;

  const status = String(req.query.status || "").trim().toUpperCase();
  const onlyActive = req.query.onlyActive === "true" || req.query.onlyActive === true;

  if (status) q.status = status;
  else if (onlyActive) q.status = "ACTIVE";

  const limit = Math.min(Number(req.query.limit || 500), 2000);
  const skip = Math.max(Number(req.query.skip || 0), 0);

  const items = await Bin.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
  const total = await Bin.countDocuments(q);

  const OFFLINE_AFTER_MIN = Math.max(1, Number(process.env.OFFLINE_AFTER_MIN || 10));
  const OFFLINE_AFTER_MS = OFFLINE_AFTER_MIN * 60 * 1000;
  const now = Date.now();

  const computedItems = (items || []).map((b) => {
    const last = b.lastTelemetryAt ? new Date(b.lastTelemetryAt).getTime() : 0;
    const isOffline = !last || now - last > OFFLINE_AFTER_MS;
    return { ...b, isOffline };
  });

  res.json({ items: computedItems, total, limit, skip });
});



const getBinById = asyncHandler(async (req, res) => {
  const bin = await Bin.findById(req.params.id).lean()
  if (!bin) throw notFound('Bin not found')
  res.json({ bin })
})

const updateBin = asyncHandler(async (req, res) => {
  const { id } = req.params

  const allowed = ['binId', 'householdId', 'virtualBinId', 'location', 'status']
  const patch = {}
  for (const k of allowed) {
    if (req.body[k] !== undefined) patch[k] = req.body[k]
  }

  if (patch.householdId) {
    const household = await Household.findById(patch.householdId).lean()
    if (!household) throw notFound('Household not found')
  }

  const bin = await Bin.findByIdAndUpdate(id, patch, {
    new: true,
    runValidators: true
  }).lean()
  if (!bin) throw notFound('Bin not found')

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_UPDATE_BIN',
    entityType: 'Bin',
    entityId: bin._id,
    meta: { patch },
    req
  })

  res.json({ bin })
})

const deleteBin = asyncHandler(async (req, res) => {
  const { id } = req.params

  const bin = await Bin.findByIdAndDelete(id).lean()
  if (!bin) throw notFound('Bin not found')

  // remove membership record if any
  await VirtualBinMember.deleteMany({ binId: id })

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_DELETE_BIN',
    entityType: 'Bin',
    entityId: id,
    req
  })

  res.json({ status: 'ok' })
})

// --------------------
// Virtual Bins
// --------------------

const createVirtualBin = asyncHandler(async (req, res) => {
  const vb = await VirtualBin.create(req.body)

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_CREATE_VIRTUAL_BIN',
    entityType: 'VirtualBin',
    entityId: vb._id,
    req
  })

  res.status(201).json({ virtualBin: vb })
})

const listVirtualBins = asyncHandler(async (req, res) => {
  const q = {}
  if (req.query.zoneId) q.zoneId = req.query.zoneId

  const items = await VirtualBin.find(q).sort({ createdAt: -1 }).lean()
  res.json({ items })
})

const getVirtualBinById = asyncHandler(async (req, res) => {
  const vb = await VirtualBin.findById(req.params.id).lean()
  if (!vb) throw notFound('Virtual bin not found')
  res.json({ virtualBin: vb })
})

const updateVirtualBin = asyncHandler(async (req, res) => {
  const { id } = req.params

  const allowed = ['name', 'zoneId', 'centroid', 'polygon', 'thresholds', 'isActive']
  const patch = {}
  for (const k of allowed) {
    if (req.body[k] !== undefined) patch[k] = req.body[k]
  }

  const vb = await VirtualBin.findByIdAndUpdate(id, patch, {
    new: true,
    runValidators: true
  }).lean()
  if (!vb) throw notFound('Virtual bin not found')

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_UPDATE_VIRTUAL_BIN',
    entityType: 'VirtualBin',
    entityId: vb._id,
    meta: { patch },
    req
  })

  res.json({ virtualBin: vb })
})

const deleteVirtualBin = asyncHandler(async (req, res) => {
  const { id } = req.params

  const vb = await VirtualBin.findByIdAndDelete(id).lean()
  if (!vb) throw notFound('Virtual bin not found')

  await VirtualBinMember.deleteMany({ virtualBinId: id })
  await Bin.updateMany({ virtualBinId: id }, { $set: { virtualBinId: null } })

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_DELETE_VIRTUAL_BIN',
    entityType: 'VirtualBin',
    entityId: id,
    req
  })

  res.json({ status: 'ok' })
})

const setVirtualBinMembers = asyncHandler(async (req, res) => {
  const { binIds } = req.body

  const vb = await VirtualBin.findById(req.params.id).lean()
  if (!vb) throw notFound('Virtual bin not found')

  await VirtualBinMember.deleteMany({ virtualBinId: vb._id })

  const docs = (binIds || []).map((binId) => ({ virtualBinId: vb._id, binId }))
  if (docs.length) {
    await VirtualBinMember.insertMany(docs)
    await Bin.updateMany({ _id: { $in: binIds } }, { $set: { virtualBinId: vb._id } })
  }

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_SET_VIRTUAL_BIN_MEMBERS',
    entityType: 'VirtualBin',
    entityId: vb._id,
    meta: { count: (binIds || []).length },
    req
  })

  res.json({ status: 'ok', count: (binIds || []).length })
})

// --------------------
// Vehicles
// --------------------

const createVehicle = asyncHandler(async (req, res) => {
  const v = await Vehicle.create(req.body)

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_CREATE_VEHICLE',
    entityType: 'Vehicle',
    entityId: v._id,
    req
  })

  res.status(201).json({ vehicle: v })
})

const listVehicles = asyncHandler(async (req, res) => {
  const q = {}
  if (req.query.vehicleType) q.vehicleType = req.query.vehicleType

  const items = await Vehicle.find(q).sort({ createdAt: -1 }).lean()
  res.json({ items })
})

const getVehicleById = asyncHandler(async (req, res) => {
  const vehicle = await Vehicle.findById(req.params.id).lean()
  if (!vehicle) throw notFound('Vehicle not found')
  res.json({ vehicle })
})

const updateVehicle = asyncHandler(async (req, res) => {
  const { id } = req.params

  const allowed = [
    'code',
    'vehicleType',
    'capacityKg',
    'isActive',
    'shiftStart',
    'shiftEnd',
    'crewUserIds'
  ]
  const patch = {}
  for (const k of allowed) {
    if (req.body[k] !== undefined) patch[k] = req.body[k]
  }

  const vehicle = await Vehicle.findByIdAndUpdate(id, patch, {
    new: true,
    runValidators: true
  }).lean()
  if (!vehicle) throw notFound('Vehicle not found')

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_UPDATE_VEHICLE',
    entityType: 'Vehicle',
    entityId: vehicle._id,
    meta: { patch },
    req
  })

  res.json({ vehicle })
})

const deleteVehicle = asyncHandler(async (req, res) => {
  const { id } = req.params

  const vehicle = await Vehicle.findByIdAndDelete(id).lean()
  if (!vehicle) throw notFound('Vehicle not found')

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_DELETE_VEHICLE',
    entityType: 'Vehicle',
    entityId: id,
    req
  })

  res.json({ status: 'ok' })
})

// --------------------
// Billing Plans
// --------------------

const createBillingPlan = asyncHandler(async (req, res) => {
  const plan = await BillingPlan.create(req.body)

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_CREATE_BILLING_PLAN',
    entityType: 'BillingPlan',
    entityId: plan._id,
    req
  })

  res.status(201).json({ plan })
})

const listBillingPlans = asyncHandler(async (req, res) => {
  const items = await BillingPlan.find().sort({ createdAt: -1 }).lean()
  res.json({ items })
})

const updateBillingPlan = asyncHandler(async (req, res) => {
  const { id } = req.params

  const allowed = [
    'name',
    'billingMode',
    'monthlyFee',
    'annualFee',
    'dailyPickupFee',
    'bulkyDailyChargeOverride',
    'isActive'
  ]

  const patch = {}
  for (const k of allowed) {
    if (req.body[k] !== undefined) patch[k] = req.body[k]
  }

  const plan = await BillingPlan.findByIdAndUpdate(id, patch, {
    new: true,
    runValidators: true
  }).lean()

  if (!plan) throw notFound('Billing plan not found')

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_UPDATE_BILLING_PLAN',
    entityType: 'BillingPlan',
    entityId: plan._id,
    meta: { patch },
    req
  })

  res.json({ plan })
})

const deleteBillingPlan = asyncHandler(async (req, res) => {
  const { id } = req.params

  const plan = await BillingPlan.findByIdAndDelete(id).lean()
  if (!plan) throw notFound('Billing plan not found')

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_DELETE_BILLING_PLAN',
    entityType: 'BillingPlan',
    entityId: id,
    meta: { name: plan?.name },
    req
  })

  res.json({ status: 'ok' })
})

//viwe active payments
const PaymentTransaction = require("../models/PaymentTransaction");

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

//admin see payment.
const listPaymentTransactions = asyncHandler(async (req, res) => {
  const status = req.query.status ? String(req.query.status).trim().toUpperCase() : null;
  const kind = req.query.kind ? String(req.query.kind).trim().toUpperCase() : null;

  const limit = Math.min(toInt(req.query.limit) || 200, 1000);
  const skip = Math.max(toInt(req.query.skip) || 0, 0);

  const q = {};
  if (status) q.status = status;
  if (kind) q.kind = kind;

  // date range
  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;

  if (from && !Number.isNaN(from.getTime())) {
    q.createdAt = q.createdAt || {};
    q.createdAt.$gte = from;
  }
  if (to && !Number.isNaN(to.getTime())) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    q.createdAt = q.createdAt || {};
    q.createdAt.$lte = end;
  }

  // search
  const search = req.query.search ? String(req.query.search).trim() : "";
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    q.$or = [
      { transactionUuid: rx },
      { providerRefId: rx },
      { provider: rx },
      { currency: rx },
    ];
  }

  const items = await PaymentTransaction.find(q)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .populate("userId", "name fullName firstName lastName email")
    .populate("planId", "name monthlyFee annualFee")
    .lean();

  res.json({ items, limit, skip });
});


// --------------------
// Reward Rates
// --------------------

const createRewardRate = asyncHandler(async (req, res) => {
  const existing = await RewardRate.findOne({ category: req.body.category }).lean()
  if (existing) throw badRequest('Category already exists')

  const rate = await RewardRate.create(req.body)

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_CREATE_REWARD_RATE',
    entityType: 'RewardRate',
    entityId: rate._id,
    req
  })

  res.status(201).json({ rate })
})

const listRewardRates = asyncHandler(async (req, res) => {
  const items = await RewardRate.find().sort({ createdAt: -1 }).lean()
  res.json({ items })
})

const getRewardRateById = asyncHandler(async (req, res) => {
  const rate = await RewardRate.findById(req.params.id).lean()
  if (!rate) throw notFound('Reward rate not found')
  res.json({ rate })
})

const updateRewardRate = asyncHandler(async (req, res) => {
  const { id } = req.params

  const allowed = ['category', 'ratePerUnit', 'isActive']
  const patch = {}
  for (const k of allowed) {
    if (req.body[k] !== undefined) patch[k] = req.body[k]
  }

  // prevent duplicate category if changing category
  if (patch.category) {
    const exists = await RewardRate.findOne({ category: patch.category, _id: { $ne: id } }).lean()
    if (exists) throw badRequest('Category already exists')
  }

  const rate = await RewardRate.findByIdAndUpdate(id, patch, {
    new: true,
    runValidators: true
  }).lean()
  if (!rate) throw notFound('Reward rate not found')

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_UPDATE_REWARD_RATE',
    entityType: 'RewardRate',
    entityId: rate._id,
    meta: { patch },
    req
  })

  res.json({ rate })
})

const deleteRewardRate = asyncHandler(async (req, res) => {
  const { id } = req.params

  const rate = await RewardRate.findByIdAndDelete(id).lean()
  if (!rate) throw notFound('Reward rate not found')

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_DELETE_REWARD_RATE',
    entityType: 'RewardRate',
    entityId: id,
    req
  })

  res.json({ status: 'ok' })
})

// --------------------
// Membership Plans
// --------------------

const createMembershipPlan = asyncHandler(async (req, res) => {
  const plan = await MembershipPlan.create(req.body)

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_CREATE_MEMBERSHIP_PLAN',
    entityType: 'MembershipPlan',
    entityId: plan._id,
    req
  })

  res.status(201).json({ plan })
})

const listMembershipPlans = asyncHandler(async (req, res) => {
  const items = await MembershipPlan.find().sort({ createdAt: -1 }).lean()
  res.json({ items })
})

const updateMembershipPlan = asyncHandler(async (req, res) => {
  const plan = await MembershipPlan.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  }).lean()
  if (!plan) throw notFound('Membership plan not found')

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_UPDATE_MEMBERSHIP_PLAN',
    entityType: 'MembershipPlan',
    entityId: plan._id,
    req
  })

  res.json({ plan })
})

const deactivateMembershipPlan = asyncHandler(async (req, res) => {
  const plan = await MembershipPlan.findById(req.params.id)
  if (!plan) throw notFound('Membership plan not found')

  plan.isActive = false
  await plan.save()

  await audit({
    actorUserId: req.user._id,
    action: 'ADMIN_DEACTIVATE_MEMBERSHIP_PLAN',
    entityType: 'MembershipPlan',
    entityId: plan._id,
    req
  })

  res.json({ plan })
})

// --------------------
// Exports
// --------------------

module.exports = {
  // Users
  createUser,
  listUsers,
  updateUser,
  deleteUser,

  // Zones
  createZone,
  listZones,
  getZoneById,
  updateZone,
  deleteZone,

  // Households
  createHousehold,
  listHouseholds,
  getHouseholdById,
  updateHousehold,
  deleteHousehold,

  // Bins
  createBin,
  listBins,
  getBinById,
  updateBin,
  deleteBin,

  // Virtual Bins
  createVirtualBin,
  listVirtualBins,
  getVirtualBinById,
  updateVirtualBin,
  deleteVirtualBin,
  setVirtualBinMembers,

  // Vehicles
  createVehicle,
  listVehicles,
  getVehicleById,
  updateVehicle,
  deleteVehicle,

  // Billing Plans
  createBillingPlan,
  listBillingPlans,
  updateBillingPlan,
  deleteBillingPlan,

  //admin see payed
    // Payment Transactions
  listPaymentTransactions,


  // Reward Rates
  createRewardRate,
  listRewardRates,
  getRewardRateById,
  updateRewardRate,
  deleteRewardRate,

  // Membership Plans
  createMembershipPlan,
  listMembershipPlans,
  updateMembershipPlan,
  deactivateMembershipPlan

}

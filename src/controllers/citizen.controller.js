const asyncHandler = require('../utils/asyncHandler');
const { CASE_TYPES, CASE_STATUSES } = require('../config/constants');
const Case = require('../models/Case');
const Household = require('../models/Household');
const RewardClaim = require('../models/RewardClaim');
const RewardRate = require('../models/RewardRate');
const WalletTransaction = require('../models/WalletTransaction');
const Invoice = require('../models/Invoice');
const BillingPlan = require('../models/BillingPlan');
const { listMembershipPlans, subscribeToMembership, cancelMembership, getActiveMembership } = require('../services/membershipService');
const { submitRecyclable, listMyRecyclables } = require('../services/recyclableService');
const { listNotifications, markAsRead } = require('../services/notificationService');
// const { createPaymentIntent } = require('../services/paymentService');
const { audit } = require('../services/auditService');
const { badRequest, notFound } = require('../utils/errors');
const { listMyHouseholds } = require('../services/recyclableService');
const { createPaymentIntent, handleKhaltiCallback } = require('../services/paymentService');


function openFromStatus(status) {
  return !['COMPLETED', 'FAILED', 'CANCELLED', 'REJECTED'].includes(status);
}


const getMyHouseholds = asyncHandler(async (req, res) => {
  const items = await listMyHouseholds({ userId: req.user._id });
  res.json({ items });
});

const getMyHousehold = asyncHandler(async (req, res) => {
  const household = await Household.findOne({ citizenUserId: req.user._id }).lean();
  if (!household) return res.status(404).json({ message: "Household not found for this user" });
  res.json(household);
});


const createLitterReport = asyncHandler(async (req, res) => {
  const c = await Case.create({
    type: CASE_TYPES.LITTER,
    status: CASE_STATUSES.PENDING_VALIDATION,
    isOpen: true,
    createdByUserId: req.user._id,
    location: req.body.location,
    description: req.body.description || '',
    priority: 3
  });
  await audit({ actorUserId: req.user._id, action: 'CITIZEN_CREATE_LITTER', entityType: 'Case', entityId: c._id, req });
  res.status(201).json({ case: c });
});

const createBulkyRequest = asyncHandler(async (req, res) => {
  const household = await Household.findById(req.body.householdId).lean();
  if (!household) throw notFound('Household not found');
  if (req.body.bulkyWeightKg <= 0) throw badRequest('Invalid bulkyWeightKg');

  const c = await Case.create({
    type: CASE_TYPES.BULKY,
    status: CASE_STATUSES.PENDING_VALIDATION,
    isOpen: true,
    createdByUserId: req.user._id,
    householdId: household._id,
    zoneId: household.zoneId,
    location: household.location,
    description: req.body.description || '',
    bulkyWeightKg: req.body.bulkyWeightKg,
    priority: 3
  });

  await audit({ actorUserId: req.user._id, action: 'CITIZEN_CREATE_BULKY', entityType: 'Case', entityId: c._id, req });
  res.status(201).json({ case: c });
});

const listCases = asyncHandler(async (req, res) => {
  const q = { createdByUserId: req.user._id };
  if (req.query.status) q.status = req.query.status;
  const items = await Case.find(q).sort({ createdAt: -1 }).lean();
  res.json({ items });
});

const createRewardClaim = asyncHandler(async (req, res) => {
  const rate = await RewardRate.findOne({ category: req.body.category, isActive: true }).lean();
  if (!rate) throw badRequest('Invalid or inactive category');

  const claim = await RewardClaim.create({
    userId: req.user._id,
    category: req.body.category,
    quantity: req.body.quantity,
    status: 'PENDING'
  });

  await audit({ actorUserId: req.user._id, action: 'CITIZEN_CREATE_REWARD_CLAIM', entityType: 'RewardClaim', entityId: claim._id, req });
  res.status(201).json({ claim });
});

const walletSummary = asyncHandler(async (req, res) => {
  const tx = await WalletTransaction.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(200).lean();
  let balance = 0;
  for (const t of tx) {
    balance += t.type === 'CREDIT' ? t.amount : -t.amount;
  }
  res.json({ balance, transactions: tx });
});

const listInvoices = asyncHandler(async (req, res) => {
  const items = await Invoice.find({ userId: req.user._id }).sort({ month: -1 }).lean();
  res.json({ items });
});

// ✅ Billing plans (monthly + daily)
const listBillingPlans = asyncHandler(async (req, res) => {
  const items = await BillingPlan.find({ isActive: true }).sort({ createdAt: -1 }).lean();
  res.json({ items });
});

// ✅ Update my household plan
const updateMyHouseholdPlan = asyncHandler(async (req, res) => {
  const h = await Household.findById(req.params.householdId);
  if (!h) throw notFound('Household not found');
  if (String(h.citizenUserId || '') !== String(req.user._id)) throw badRequest('Household does not belong to user');

  h.planId = req.body.planId || null;
  await h.save();
  await audit({ actorUserId: req.user._id, action: 'CITIZEN_UPDATE_PLAN', entityType: 'Household', entityId: h._id, req });
  res.json({ household: h });
});

// ✅ Update pickup schedule days
const updateMyPickupSchedule = asyncHandler(async (req, res) => {
  const h = await Household.findById(req.params.householdId);
  if (!h) throw notFound('Household not found');
  if (String(h.citizenUserId || '') !== String(req.user._id)) throw badRequest('Household does not belong to user');

  h.pickupScheduleDays = req.body.pickupScheduleDays;
  await h.save();
  await audit({ actorUserId: req.user._id, action: 'CITIZEN_UPDATE_PICKUP_SCHEDULE', entityType: 'Household', entityId: h._id, req });
  res.json({ household: h });
});

// ✅ Membership
const listMemberships = asyncHandler(async (req, res) => {
  const items = await listMembershipPlans();
  res.json({ items });
});

const getMyMembership = asyncHandler(async (req, res) => {
  const active = await getActiveMembership(req.user._id);
  res.json({ active });
});

const subscribeMembership = asyncHandler(async (req, res) => {
  const active = await subscribeToMembership({ userId: req.user._id, planId: req.body.planId });
  await audit({ actorUserId: req.user._id, action: 'CITIZEN_SUBSCRIBE_MEMBERSHIP', entityType: 'UserMembership', entityId: active.membership._id, req });
  res.status(201).json(active);
});

const cancelMyMembership = asyncHandler(async (req, res) => {
  const cancelled = await cancelMembership({ userId: req.user._id, note: req.body.note || '' });
  await audit({ actorUserId: req.user._id, action: 'CITIZEN_CANCEL_MEMBERSHIP', entityType: 'UserMembership', entityId: cancelled?._id, req });
  res.json({ cancelled });
});

// ✅ Recyclable submission workflow
const createRecyclableSubmission = asyncHandler(async (req, res) => {
  const { householdId, category, pieces, avgWeightKg, estimatedTotalWeightKg, scheduledDate } = req.body;
  const { submission, case: c, task } = await submitRecyclable({
    userId: req.user._id,
    householdId,
    category,
    pieces,
    avgWeightKg,
    estimatedTotalWeightKg,
    scheduledDate,
    files: req.files || []
  });

  await audit({ actorUserId: req.user._id, action: 'CITIZEN_CREATE_RECYCLABLE', entityType: 'RecyclableSubmission', entityId: submission._id, req });
  res.status(201).json({ submission, case: c, task });
});

const listRecyclables = asyncHandler(async (req, res) => {
  const items = await listMyRecyclables({ userId: req.user._id, status: req.query.status || null, limit: Number(req.query.limit || 100) });
  res.json({ items });
});

// ✅ Notifications
const myNotifications = asyncHandler(async (req, res) => {
  const items = await listNotifications({ userId: req.user._id, limit: Number(req.query.limit || 50), unreadOnly: String(req.query.unreadOnly || 'false') === 'true' });
  res.json({ items });
});

const markNotificationRead = asyncHandler(async (req, res) => {
  const n = await markAsRead({ userId: req.user._id, notificationId: req.params.id });
  if (!n) throw notFound('Notification not found');
  res.json({ notification: n });
});


// payment logic from khalti
const payInvoice = asyncHandler(async (req, res) => {
  const provider = req.body.provider || process.env.PAYMENT_PROVIDER || 'MOCK';

  const intent = await createPaymentIntent({
    userId: req.user._id,
    invoiceId: req.params.invoiceId,
    provider
  });

  await audit({
    actorUserId: req.user._id,
    action: 'CITIZEN_INITIATE_PAYMENT',
    entityType: 'PaymentIntent',
    entityId: intent._id,
    req
  });

  res.status(201).json({ intent });
});

// NEW: Khalti callback
const khaltiCallback = asyncHandler(async (req, res) => {
  const { pidx } = req.query;

  const result = await handleKhaltiCallback(pidx);

  if (!result.success) {
    return res.status(400).json({
      message: 'Payment not completed',
      status: result.status
    });
  }

  res.json({
    message: 'Payment successful',
    transactionId: result.transactionId
  });
});




// // ✅ Invoice payment intent (Khalti / Mock)
// const payInvoice = asyncHandler(async (req, res) => {
//   const provider = req.body.provider || process.env.PAYMENT_PROVIDER || 'MOCK';
//   const intent = await createPaymentIntent({ userId: req.user._id, invoiceId: req.params.invoiceId, provider });
//   await audit({ actorUserId: req.user._id, action: 'CITIZEN_INITIATE_PAYMENT', entityType: 'PaymentIntent', entityId: intent._id, req });
//   res.status(201).json({ intent });
// });

module.exports = {
  createLitterReport,
  createBulkyRequest,
  listCases,
  createRewardClaim,
  walletSummary,
  listInvoices,
  listBillingPlans,
  updateMyHouseholdPlan,
  updateMyPickupSchedule,
  listMemberships,
  getMyMembership,
  subscribeMembership,
  cancelMyMembership,
  createRecyclableSubmission,
  listRecyclables,
  myNotifications,
  getMyHousehold,
  getMyHouseholds,
  markNotificationRead,
  //payInvoice,
  payInvoice, 
  khaltiCallback
};

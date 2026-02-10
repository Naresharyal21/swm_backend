// src/controllers/citizen.controller.js
const asyncHandler = require("../utils/asyncHandler");
const { CASE_TYPES, CASE_STATUSES } = require("../config/constants");
const Case = require("../models/Case");
const Household = require("../models/Household");
const RewardClaim = require("../models/RewardClaim");
const RewardRate = require("../models/RewardRate");
const WalletTransaction = require("../models/WalletTransaction");
const Invoice = require("../models/Invoice");
const BillingPlan = require("../models/BillingPlan");
const BinId = require("../models/BinId");

const {
  listMembershipPlans,
  subscribeToMembership,
  cancelMembership,
  getActiveMembership,
} = require("../services/membershipService");

const { submitRecyclable, listMyRecyclables } = require("../services/recyclableService");
const { listNotifications, markAsRead } = require("../services/notificationService");
const { audit } = require("../services/auditService");
const { badRequest, notFound } = require("../utils/errors");

const { createPaymentIntent } = require("../services/paymentService");

// NEW: models for selectable zones + virtual bins + one-step create + cascade delete
const mongoose = require("mongoose");
const Zone = require("../models/Zone");
const VirtualBin = require("../models/VirtualBin");
const Bin = require("../models/Bin");

// ✅ PaymentTransaction model (for /citizen/transactions + /activate-bin)
const PaymentTransaction = require("../models/PaymentTransaction");

function openFromStatus(status) {
  return !["COMPLETED", "FAILED", "CANCELLED", "REJECTED"].includes(status);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function isObjId(v) {
  return mongoose.Types.ObjectId.isValid(String(v));
}

function toPoint(location) {
  // expects { type:'Point', coordinates:[lng,lat] }
  if (
    !location ||
    location.type !== "Point" ||
    !Array.isArray(location.coordinates) ||
    location.coordinates.length !== 2
  ) {
    const err = new Error("location must be GeoJSON Point with [lng, lat]");
    err.status = 400;
    throw err;
  }
  const [lng, lat] = location.coordinates.map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    const err = new Error("Invalid lng/lat");
    err.status = 400;
    throw err;
  }
  return { type: "Point", coordinates: [lng, lat] };
}

/* ------------------------------------------------------------------ */
/* My households                                                       */
/* ------------------------------------------------------------------ */
const getMyHouseholds = asyncHandler(async (req, res) => {
  const items = await Household.aggregate([
    { $match: { citizenUserId: req.user._id } },
    { $sort: { createdAt: -1 } },

    {
      $lookup: {
        from: "bins",
        localField: "_id",
        foreignField: "householdId",
        as: "bins",
      },
    },

    { $addFields: { bin: { $arrayElemAt: ["$bins", 0] } } },

    {
      $project: {
        _id: 1,
        zoneId: 1,
        citizenUserId: 1,
        address: 1,
        location: 1,
        planId: 1,
        pickupScheduleDays: 1,
        createdAt: 1,
        updatedAt: 1,

        bin: {
          _id: "$bin._id",
          binId: "$bin.binId",
          status: "$bin.status",
          updatedAt: "$bin.updatedAt",
        },
      },
    },
  ]);

  return res.json({ items });
});

const getMyHousehold = asyncHandler(async (req, res) => {
  const household = await Household.findOne({ citizenUserId: req.user._id }).lean();
  if (!household) {
    return res.status(404).json({ message: "Household not found for this user" });
  }
  res.json(household);
});

/* ------------------------------------------------------------------ */
/* Cases                                                               */
/* ------------------------------------------------------------------ */
const createLitterReport = asyncHandler(async (req, res) => {
  const c = await Case.create({
    type: CASE_TYPES.LITTER,
    status: CASE_STATUSES.PENDING_VALIDATION,
    isOpen: true,
    createdByUserId: req.user._id,
    location: req.body.location,
    description: req.body.description || "",
    priority: 3,
  });

  await audit({
    actorUserId: req.user._id,
    action: "CITIZEN_CREATE_LITTER",
    entityType: "Case",
    entityId: c._id,
    req,
  });

  res.status(201).json({ case: c });
});

const createBulkyRequest = asyncHandler(async (req, res) => {
  const household = await Household.findById(req.body.householdId).lean();
  if (!household) throw notFound("Household not found");
  if (req.body.bulkyWeightKg <= 0) throw badRequest("Invalid bulkyWeightKg");

  const c = await Case.create({
    type: CASE_TYPES.BULKY,
    status: CASE_STATUSES.PENDING_VALIDATION,
    isOpen: true,
    createdByUserId: req.user._id,
    householdId: household._id,
    zoneId: household.zoneId,
    location: household.location,
    description: req.body.description || "",
    bulkyWeightKg: req.body.bulkyWeightKg,
    priority: 3,
  });

  await audit({
    actorUserId: req.user._id,
    action: "CITIZEN_CREATE_BULKY",
    entityType: "Case",
    entityId: c._id,
    req,
  });

  res.status(201).json({ case: c });
});

const listCases = asyncHandler(async (req, res) => {
  const q = { createdByUserId: req.user._id };
  if (req.query.status) q.status = req.query.status;
  const items = await Case.find(q).sort({ createdAt: -1 }).lean();
  res.json({ items });
});

/* ------------------------------------------------------------------ */
/* Rewards + wallet                                                    */
/* ------------------------------------------------------------------ */
const createRewardClaim = asyncHandler(async (req, res) => {
  const rate = await RewardRate.findOne({ category: req.body.category, isActive: true }).lean();
  if (!rate) throw badRequest("Invalid or inactive category");

  const claim = await RewardClaim.create({
    userId: req.user._id,
    category: req.body.category,
    quantity: req.body.quantity,
    status: "PENDING",
  });

  await audit({
    actorUserId: req.user._id,
    action: "CITIZEN_CREATE_REWARD_CLAIM",
    entityType: "RewardClaim",
    entityId: claim._id,
    req,
  });

  res.status(201).json({ claim });
});

const walletSummary = asyncHandler(async (req, res) => {
  const tx = await WalletTransaction.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  let balance = 0;
  for (const t of tx) balance += t.type === "CREDIT" ? t.amount : -t.amount;

  res.json({ balance, transactions: tx });
});

/* ------------------------------------------------------------------ */
/* Invoices + billing plans                                            */
/* ------------------------------------------------------------------ */
const listInvoices = asyncHandler(async (req, res) => {
  const items = await Invoice.find({ userId: req.user._id }).sort({ month: -1 }).lean();
  res.json({ items });
});

const listBillingPlans = asyncHandler(async (req, res) => {
  const items = await BillingPlan.find({ isActive: true }).sort({ createdAt: -1 }).lean();
  res.json({ items });
});

const updateMyHouseholdPlan = asyncHandler(async (req, res) => {
  const h = await Household.findById(req.params.householdId);
  if (!h) throw notFound("Household not found");
  if (String(h.citizenUserId || "") !== String(req.user._id))
    throw badRequest("Household does not belong to user");

  h.planId = req.body.planId || null;
  await h.save();

  await audit({
    actorUserId: req.user._id,
    action: "CITIZEN_UPDATE_PLAN",
    entityType: "Household",
    entityId: h._id,
    req,
  });

  res.json({ household: h });
});

const updateMyPickupSchedule = asyncHandler(async (req, res) => {
  const h = await Household.findById(req.params.householdId);
  if (!h) throw notFound("Household not found");
  if (String(h.citizenUserId || "") !== String(req.user._id))
    throw badRequest("Household does not belong to user");

  h.pickupScheduleDays = req.body.pickupScheduleDays;
  await h.save();

  await audit({
    actorUserId: req.user._id,
    action: "CITIZEN_UPDATE_PICKUP_SCHEDULE",
    entityType: "Household",
    entityId: h._id,
    req,
  });

  res.json({ household: h });
});

/* ------------------------------------------------------------------ */
/* Membership                                                          */
/* ------------------------------------------------------------------ */
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

  await audit({
    actorUserId: req.user._id,
    action: "CITIZEN_SUBSCRIBE_MEMBERSHIP",
    entityType: "UserMembership",
    entityId: active.membership._id,
    req,
  });

  res.status(201).json(active);
});

const cancelMyMembership = asyncHandler(async (req, res) => {
  const cancelled = await cancelMembership({ userId: req.user._id, note: req.body.note || "" });

  await audit({
    actorUserId: req.user._id,
    action: "CITIZEN_CANCEL_MEMBERSHIP",
    entityType: "UserMembership",
    entityId: cancelled?._id,
    req,
  });

  res.json({ cancelled });
});

/* ------------------------------------------------------------------ */
/* Transactions                                                        */
/* ------------------------------------------------------------------ */
// GET /api/citizen/transactions?householdId=...
const listMyTransactions = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { householdId } = req.query || {};

  const q = { userId, provider: "ESEWA" };

  if (householdId) {
    if (!isObjId(householdId)) throw badRequest("Invalid householdId");
    q.householdId = householdId;
  }

  const items = await PaymentTransaction.find(q).sort({ createdAt: -1 }).limit(500).lean();
  res.json({ items });
});

/* ------------------------------------------------------------------ */
/* Recyclables                                                         */
/* ------------------------------------------------------------------ */
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
    files: req.files || [],
  });

  await audit({
    actorUserId: req.user._id,
    action: "CITIZEN_CREATE_RECYCLABLE",
    entityType: "RecyclableSubmission",
    entityId: submission._id,
    req,
  });

  res.status(201).json({ submission, case: c, task });
});

const listRecyclables = asyncHandler(async (req, res) => {
  const items = await listMyRecyclables({
    userId: req.user._id,
    status: req.query.status || null,
    limit: Number(req.query.limit || 100),
  });
  res.json({ items });
});

/* ------------------------------------------------------------------ */
/* Notifications                                                        */
/* ------------------------------------------------------------------ */
const myNotifications = asyncHandler(async (req, res) => {
  const items = await listNotifications({
    userId: req.user._id,
    limit: Number(req.query.limit || 50),
    unreadOnly: String(req.query.unreadOnly || "false") === "true",
  });
  res.json({ items });
});

const markNotificationRead = asyncHandler(async (req, res) => {
  const n = await markAsRead({ userId: req.user._id, notificationId: req.params.id });
  if (!n) throw notFound("Notification not found");
  res.json({ notification: n });
});

/* ------------------------------------------------------------------ */
/* Payments                                                             */
/* ------------------------------------------------------------------ */
const payInvoice = asyncHandler(async (req, res) => {
  const provider = req.body.provider || process.env.PAYMENT_PROVIDER || "MOCK";

  const intent = await createPaymentIntent({
    userId: req.user._id,
    invoiceId: req.params.invoiceId,
    provider,
  });

  await audit({
    actorUserId: req.user._id,
    action: "CITIZEN_INITIATE_PAYMENT",
    entityType: "PaymentIntent",
    entityId: intent._id,
    req,
  });

  res.status(201).json({ intent });
});

/* ------------------------------------------------------------------ */
/* ✅ Activate bin after payment                                        */
/* ------------------------------------------------------------------ */
const activateBinAfterPayment = asyncHandler(async (req, res) => {
  const { householdId, planId } = req.body || {};

  if (!householdId || !isObjId(householdId)) throw badRequest("Valid householdId is required");
  if (!planId || !isObjId(planId)) throw badRequest("Valid planId is required");

  const h = await Household.findById(householdId).select("_id citizenUserId").lean();
  if (!h) throw notFound("Household not found");
  if (String(h.citizenUserId || "") !== String(req.user._id))
    throw badRequest("Household does not belong to user");

  const tx = await PaymentTransaction.findOne({
    userId: req.user._id,
    planId: planId,
    status: { $in: ["COMPLETE", "Complete", "complete"] },
    kind: { $in: ["MONTHLY", "ANNUAL", "Monthly", "Annual", "monthly", "annual"] },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!tx) throw badRequest("No COMPLETE MONTHLY/ANNUAL payment found for this plan");

  await Household.updateOne({ _id: h._id }, { $set: { planId: planId } });

  const bin = await Bin.findOne({ householdId: h._id });
  if (!bin) throw notFound("Bin not found for this household");

  bin.status = "ACTIVE";
  await bin.save();

  await audit({
    actorUserId: req.user._id,
    action: "CITIZEN_ACTIVATE_BIN",
    entityType: "Bin",
    entityId: bin._id,
    req,
  });

  res.json({
    ok: true,
    message: "Bin activated",
    bin: {
      _id: bin._id,
      binId: bin.binId,
      householdId: bin.householdId,
      status: bin.status,
      updatedAt: bin.updatedAt,
    },
  });
});

/* ------------------------------------------------------------------ */
/* ✅ Deactivate bin                                                    */
/* ------------------------------------------------------------------ */
const deactivateBin = asyncHandler(async (req, res) => {
  const { householdId } = req.body || {};
  if (!householdId || !isObjId(householdId)) throw badRequest("Valid householdId is required");

  const h = await Household.findById(householdId).select("_id citizenUserId").lean();
  if (!h) throw notFound("Household not found");
  if (String(h.citizenUserId || "") !== String(req.user._id))
    throw badRequest("Household does not belong to user");

  const bin = await Bin.findOne({ householdId: h._id });
  if (!bin) throw notFound("Bin not found for this household");

  bin.status = "INACTIVE";
  await bin.save();

  await Household.updateOne({ _id: h._id }, { $set: { planId: null } });

  await audit({
    actorUserId: req.user._id,
    action: "CITIZEN_DEACTIVATE_BIN",
    entityType: "Bin",
    entityId: bin._id,
    req,
  });

  res.json({
    ok: true,
    message: "Bin deactivated",
    bin: {
      _id: bin._id,
      binId: bin.binId,
      householdId: bin.householdId,
      status: bin.status,
      updatedAt: bin.updatedAt,
    },
  });
});

/* ------------------------------------------------------------------ */
/* Zones + virtual bins                                                 */
/* ------------------------------------------------------------------ */
const listZones = asyncHandler(async (req, res) => {
  const items = await Zone.find({})
    .select("_id name wardCode centroid")
    .sort({ name: 1 })
    .lean();
  res.json({ items });
});

const listVirtualBins = asyncHandler(async (req, res) => {
  const { zoneId } = req.query || {};
  const filter = { isActive: true };

  if (zoneId) {
    if (!isObjId(zoneId)) throw badRequest("Invalid zoneId");
    filter.zoneId = zoneId;
  }

  const items = await VirtualBin.find(filter)
    .select("_id name zoneId centroid isActive")
    .sort({ name: 1 })
    .lean();

  res.json({ items });
});

/* ------------------------------------------------------------------ */
/* BinIds: citizen available (unassigned)                               */
/* ------------------------------------------------------------------ */
const listAvailableBinIds = asyncHandler(async (req, res) => {
  const q = String(req.query.q || "").trim();
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
  const page = Math.max(1, Number(req.query.page || 1));
  const skip = (page - 1) * limit;

  const filter = { isAssigned: false };
  if (q) filter.code = { $regex: q, $options: "i" };

  const [items, total] = await Promise.all([
    BinId.find(filter)
      .select("_id code createdAt isAssigned")
      .sort({ code: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    BinId.countDocuments(filter),
  ]);

  return res.json({ items, total, page, limit });
});

/* ------------------------------------------------------------------ */
/* One-step create household + bin                                      */
/* ------------------------------------------------------------------ */
const createHouseholdWithBin = asyncHandler(async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  if (!isObjId(userId)) throw badRequest("Unauthorized");

  const { address, location, binId, zoneId, virtualBinId } = req.body || {};

  if (!String(address || "").trim()) throw badRequest("address is required");
  if (!String(binId || "").trim()) throw badRequest("binId is required");

  if (!zoneId || !isObjId(zoneId)) throw badRequest("Valid zoneId is required");
  if (!virtualBinId || !isObjId(virtualBinId)) throw badRequest("Valid virtualBinId is required");

  const loc = toPoint(location);

  const zone = await Zone.findById(zoneId).select("_id").lean();
  if (!zone) throw badRequest("Invalid zoneId");

  const vb = await VirtualBin.findById(virtualBinId).select("_id zoneId isActive").lean();
  if (!vb) throw badRequest("Invalid virtualBinId");
  if (!vb.isActive) throw badRequest("Selected virtual bin is not active");
  if (String(vb.zoneId) !== String(zoneId))
    throw badRequest("Virtual bin does not belong to selected zone");

  // ✅ Reserve BinId (atomic)
  const reserved = await BinId.findOneAndUpdate(
    { code: String(binId).trim(), isAssigned: false },
    { $set: { isAssigned: true, assignedAt: new Date(), assignedTo: req.user._id } },
    { new: true }
  );

  if (!reserved) throw badRequest("Bin ID not available. Please choose another.");

  const household = await Household.create({
    zoneId,
    citizenUserId: req.user._id,
    address: String(address).trim(),
    location: loc,
  });

  let bin;
  try {
    bin = await Bin.create({
      binId: String(binId).trim(),
      householdId: household._id,
      virtualBinId: vb._id,
      fillPercent: 0,
      batteryPercent: null,
      batteryState: "OK",
      isOffline: false,
      location: loc,
      status: "INACTIVE",
    });
  } catch (e) {
    // rollback household + unreserve BinId
    await Household.deleteOne({ _id: household._id });
    await BinId.updateOne({ _id: reserved._id }, { $set: { isAssigned: false }, $unset: { assignedAt: 1, assignedTo: 1 } });

    if (e && e.code === 11000) throw badRequest("Bin ID already exists. Choose another binId.");
    throw e;
  }

  await audit({
    actorUserId: req.user._id,
    action: "CITIZEN_CREATE_HOUSEHOLD_BIN",
    entityType: "Household",
    entityId: household._id,
    req,
  });

  res.status(201).json({ household, bin });
});

/* ------------------------------------------------------------------ */
/* Delete household (+ bins cascade=1)                                  */
/* ------------------------------------------------------------------ */
const deleteHousehold = asyncHandler(async (req, res) => {
  const householdId = req.params.id;
  if (!isObjId(householdId)) throw badRequest("Invalid household id");

  const cascade = String(req.query.cascade || "") === "1";

  const household = await Household.findOne({ _id: householdId, citizenUserId: req.user._id }).lean();
  if (!household) throw notFound("Household not found");

  const binsCount = await Bin.countDocuments({ householdId });

  if (!cascade && binsCount > 0) {
    throw badRequest("Household has bins. Use cascade=1 or delete bins first.");
  }

  if (cascade) {
    await Bin.deleteMany({ householdId });
  }

  await Household.deleteOne({ _id: householdId });

  await audit({
    actorUserId: req.user._id,
    action: "CITIZEN_DELETE_HOUSEHOLD",
    entityType: "Household",
    entityId: householdId,
    req,
  });

  res.json({ ok: true, deletedBins: cascade ? binsCount : 0 });
});

/* ------------------------------------------------------------------ */
/* Exports                                                              */
/* ------------------------------------------------------------------ */
module.exports = {
  // cases
  createLitterReport,
  createBulkyRequest,
  listCases,

  // rewards + wallet
  createRewardClaim,
  walletSummary,

  // billing + invoices
  listInvoices,
  listBillingPlans,
  updateMyHouseholdPlan,
  updateMyPickupSchedule,

  // membership
  listMemberships,
  getMyMembership,
  subscribeMembership,
  cancelMyMembership,

  // recyclables
  createRecyclableSubmission,
  listRecyclables,

  // notifications
  myNotifications,
  markNotificationRead,

  // households
  getMyHousehold,
  getMyHouseholds,
  createHouseholdWithBin,
  deleteHousehold,

  // citizen dropdowns
  listZones,
  listVirtualBins,

  // binid availability
  listAvailableBinIds,

  // payments
  payInvoice,
  listMyTransactions,
  activateBinAfterPayment,
  deactivateBin,
};

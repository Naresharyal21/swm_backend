const dayjs = require("dayjs");
const Household = require("../models/Household");
const Case = require("../models/Case");
const Task = require("../models/Task");
const Evidence = require("../models/Evidence");
const RewardRate = require("../models/RewardRate");
const RecyclableSubmission = require("../models/RecyclableSubmission");
const WalletTransaction = require("../models/WalletTransaction");
const { uploadBuffer } = require("../services/s3Service");
const {
  CASE_TYPES,
  CASE_STATUSES,
  TASK_STATUSES,
} = require("../config/constants");
const { createTaskForCase } = require("./taskService");
const { getNextPickupDateForHousehold } = require("./pickupScheduleService");
const { getActiveMembership } = require("./membershipService");
const { createNotification } = require("./notificationService");

function computeQuantityKg({ estimatedTotalWeightKg, pieces, avgWeightKg }) {
  const est = Number(estimatedTotalWeightKg || 0);
  if (est > 0) return est;
  const p = Number(pieces || 0);
  const avg = Number(avgWeightKg || 0);
  if (p > 0 && avg > 0) return p * avg;
  return 0;
}

async function createEvidenceFromFiles({ ownerUserId, caseId, files }) {
  const evidenceIds = [];
  for (const file of files || []) {
    const { key } = await uploadBuffer({
      buffer: file.buffer,
      contentType: file.mimetype,
      originalName: file.originalname,
      prefix: `recyclables/${caseId}`,
    });
    const ev = await Evidence.create({
      ownerUserId,
      relatedCaseId: caseId,
      kind: "PHOTO",
      s3Key: key,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    });
    evidenceIds.push(ev._id);
  }
  return evidenceIds;
}

async function submitRecyclable({
  userId,
  householdId,
  category,
  pieces = 0,
  avgWeightKg = 0,
  estimatedTotalWeightKg = 0,
  scheduledDate = null,
  files = [],
}) {
  const household = await Household.findById(householdId).lean();
  if (!household) throw new Error("Household not found");
  if (String(household.citizenUserId || "") !== String(userId))
    throw new Error("Household does not belong to user");

  const rate = await RewardRate.findOne({ category, isActive: true }).lean();
  if (!rate) throw new Error("Invalid or inactive recyclable category");

  const qtyKg = computeQuantityKg({
    estimatedTotalWeightKg,
    pieces,
    avgWeightKg,
  });
  const estPayout =
    Number(rate.ratePerUnit || 0) * (qtyKg > 0 ? qtyKg : Number(pieces || 0));

  const date =
    scheduledDate ||
    (await getNextPickupDateForHousehold(household, new Date()));

  const c = await Case.create({
    type: CASE_TYPES.RECYCLABLE,
    status: CASE_STATUSES.APPROVED,
    isOpen: true,
    createdByUserId: userId,
    householdId: household._id,
    zoneId: household.zoneId,
    location: household.location,
    description: `Recyclable pickup: ${category}`,
    priority: 3,
  });

  const task = await createTaskForCase(c, { scheduledDate: date });

  const evidenceIds = await createEvidenceFromFiles({
    ownerUserId: userId,
    caseId: c._id,
    files,
  });

  const submission = await RecyclableSubmission.create({
    userId,
    householdId: household._id,
    caseId: c._id,
    taskId: task._id,
    category,
    pieces: Number(pieces || 0),
    avgWeightKg: Number(avgWeightKg || 0),
    estimatedTotalWeightKg: qtyKg,
    evidenceIds,
    status: "PENDING_VERIFICATION",
    estimatedPayout: estPayout,
  });

  return { submission, case: c, task };
}

async function verifyRecyclable({
  crewUserId,
  submissionId,
  verifiedPieces = 0,
  verifiedTotalWeightKg = 0,
  note = "",
}) {
  const sub = await RecyclableSubmission.findById(submissionId);
  if (!sub) throw new Error("Submission not found");
  if (sub.status !== "PENDING_VERIFICATION")
    throw new Error("Submission already processed");

  const rate = await RewardRate.findOne({
    category: sub.category,
    isActive: true,
  }).lean();
  if (!rate) throw new Error("Reward rate not found for this category");

  const qty =
    Number(verifiedTotalWeightKg || 0) > 0
      ? Number(verifiedTotalWeightKg || 0)
      : Number(verifiedPieces || 0);
  let payout = Number(rate.ratePerUnit || 0) * qty;

  // Membership bonus (optional)
  const membership = await getActiveMembership(sub.userId);
  if (membership?.plan?.recyclableBonusPercent) {
    const bonus =
      payout * (Number(membership.plan.recyclableBonusPercent) / 100);
    payout += bonus;
  }

  sub.status = "VERIFIED";
  sub.verification = {
    verifiedByUserId: crewUserId,
    verifiedAt: new Date(),
    verifiedPieces: Number(verifiedPieces || 0),
    verifiedTotalWeightKg: Number(verifiedTotalWeightKg || 0),
    verifiedPayout: payout,
    note,
  };
  await sub.save();

  // ✅ Credit wallet (auto reduces invoice)
  await WalletTransaction.create({
    userId: sub.userId,
    type: "CREDIT",
    amount: payout,
    reason: `Recyclable payout (${sub.category})`,
    refType: "RecyclableSubmission",
    refId: sub._id,
  });

  // Close associated task/case automatically for smooth crew flow
  await Task.updateOne(
    { _id: sub.taskId },
    { $set: { status: TASK_STATUSES.COMPLETED, completedAt: new Date() } },
  );
  await Case.updateOne(
    { _id: sub.caseId },
    { $set: { status: CASE_STATUSES.COMPLETED, isOpen: false } },
  );

  await createNotification({
    userId: sub.userId,
    kind: "GENERAL",
    title: "Recyclable verified",
    message: `Your recyclable waste (${sub.category}) was verified. Wallet credited: Rs. ${payout.toFixed(2)}.`,
    meta: { submissionId: String(sub._id), amount: payout },
  });

  return await RecyclableSubmission.findById(sub._id).lean();
}

async function rejectRecyclable({ crewUserId, submissionId, note = "" }) {
  const sub = await RecyclableSubmission.findById(submissionId);
  if (!sub) throw new Error("Submission not found");
  if (sub.status !== "PENDING_VERIFICATION")
    throw new Error("Submission already processed");

  sub.status = "REJECTED";
  sub.verification = {
    verifiedByUserId: crewUserId,
    verifiedAt: new Date(),
    verifiedPieces: 0,
    verifiedTotalWeightKg: 0,
    verifiedPayout: 0,
    note,
  };
  await sub.save();

  await Task.updateOne(
    { _id: sub.taskId },
    {
      $set: { status: TASK_STATUSES.FAILED, failureReason: note || "Rejected" },
    },
  );
  await Case.updateOne(
    { _id: sub.caseId },
    { $set: { status: CASE_STATUSES.REJECTED, isOpen: false } },
  );

  await createNotification({
    userId: sub.userId,
    kind: "GENERAL",
    title: "Recyclable rejected",
    message:
      `Your recyclable submission (${sub.category}) was rejected. ${note || ""}`.trim(),
    meta: { submissionId: String(sub._id) },
  });

  return await RecyclableSubmission.findById(sub._id).lean();
}

async function listMyRecyclables({ userId, status = null, limit = 100 }) {
  const q = { userId };
  if (status) q.status = status;
  return RecyclableSubmission.find(q)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

async function listMyHouseholds({ userId }) {
  return Household.find({ citizenUserId: userId })
    .sort({ createdAt: -1 })
    .select("_id address zoneId location") // keep small payload
    .lean();
}

module.exports = {
  submitRecyclable,
  verifyRecyclable,
  rejectRecyclable,
  listMyHouseholds,
  listMyRecyclables,
};

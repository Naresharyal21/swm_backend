const asyncHandler = require('../utils/asyncHandler');
const Task = require('../models/Task');
const Case = require('../models/Case');
const Vehicle = require('../models/Vehicle');
const Evidence = require('../models/Evidence');
const RecyclableSubmission = require('../models/RecyclableSubmission');
const { uploadBuffer } = require('../services/s3Service');
const { TASK_STATUSES, CASE_TYPES } = require('../config/constants');
const { notFound, forbidden, badRequest } = require('../utils/errors');
const { getPublishedRoutesForCrew } = require('../services/routeService');
const { verifyRecyclable, rejectRecyclable } = require('../services/recyclableService');
const dayjs = require('dayjs');
const { audit } = require('../services/auditService');

async function crewHasAccessToTask(crewUserId, task) {
  if (task.assignedToUserId && String(task.assignedToUserId) === String(crewUserId)) return true;
  if (task.vehicleId) {
    const v = await Vehicle.findById(task.vehicleId).select('crewUserIds').lean();
    return !!v && (v.crewUserIds || []).some(id => String(id) === String(crewUserId));
  }
  return false;
}

const getTodayRoute = asyncHandler(async (req, res) => {
  const date = req.query.date || dayjs().format('YYYY-MM-DD');
  const routes = await getPublishedRoutesForCrew({ crewUserId: req.user._id, date });
  res.json({ date, routes });
});

const listMyTasks = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.status) q.status = req.query.status;
  // tasks where assignedToUserId is me, or vehicle belongs to me
  const myVehicles = await Vehicle.find({ crewUserIds: req.user._id }).select('_id').lean();
  q.$or = [{ assignedToUserId: req.user._id }, { vehicleId: { $in: myVehicles.map(v => v._id) } }];
  const items = await Task.find(q).sort({ scheduledDate: -1, createdAt: -1 }).limit(300).lean();
  res.json({ items });
});

const updateTaskStatus = asyncHandler(async (req, res) => {
  const t = await Task.findById(req.params.id);
  if (!t) throw notFound('Task not found');
  if (!(await crewHasAccessToTask(req.user._id, t))) throw forbidden('Not allowed');

  const nextStatus = req.body.status;
  if (!Object.values(TASK_STATUSES).includes(nextStatus)) throw badRequest('Invalid status');

  t.status = nextStatus;
  if (nextStatus === TASK_STATUSES.ARRIVED) t.arrivedAt = new Date();
  if (nextStatus === TASK_STATUSES.IN_PROGRESS) t.startedAt = t.startedAt || new Date();
  if (nextStatus === TASK_STATUSES.COMPLETED) {
    // proof required for bulky + bin service
    const c = await Case.findById(t.caseId).lean();
    if (c && (c.type === CASE_TYPES.BULKY || c.type === CASE_TYPES.BIN_SERVICE) && !t.proofEvidenceId) {
      throw badRequest('Proof upload is required before completing this task');
    }
    t.completedAt = new Date();
  }
  await t.save();
  await audit({ actorUserId: req.user._id, action: 'CREW_UPDATE_TASK_STATUS', entityType: 'Task', entityId: t._id, meta: { status: nextStatus }, req });
  res.json({ task: t });
});

const uploadProof = asyncHandler(async (req, res) => {
  const t = await Task.findById(req.params.id);
  if (!t) throw notFound('Task not found');
  if (!(await crewHasAccessToTask(req.user._id, t))) throw forbidden('Not allowed');
  if (!req.file) throw badRequest('Missing file');

  const { key } = await uploadBuffer({
    buffer: req.file.buffer,
    contentType: req.file.mimetype,
    originalName: req.file.originalname,
    prefix: `proof/${t._id}`
  });

  const ev = await Evidence.create({
    ownerUserId: req.user._id,
    relatedTaskId: t._id,
    relatedCaseId: t.caseId,
    kind: 'PHOTO',
    s3Key: key,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size
  });

  t.proofEvidenceId = ev._id;
  await t.save();

  await audit({ actorUserId: req.user._id, action: 'CREW_UPLOAD_PROOF', entityType: 'Evidence', entityId: ev._id, meta: { taskId: t._id }, req });
  res.status(201).json({ evidence: ev, task: t });
});

// ✅ Crew verification for recyclable (non-disposal) submissions
const verifyRecyclableSubmission = asyncHandler(async (req, res) => {
  const sub = await RecyclableSubmission.findById(req.params.id).lean();
  if (!sub) throw notFound('Submission not found');
  const t = await Task.findById(sub.taskId).lean();
  if (!t) throw notFound('Task not found');
  if (!(await crewHasAccessToTask(req.user._id, t))) throw forbidden('Not allowed');

  // NOTE: recyclableService expects crewUserId
  const updated = await verifyRecyclable({
    submissionId: sub._id,
    crewUserId: req.user._id,
    verifiedPieces: req.body.verifiedPieces,
    verifiedTotalWeightKg: req.body.verifiedTotalWeightKg,
    note: req.body.note || ''
  });

  await audit({ actorUserId: req.user._id, action: 'CREW_VERIFY_RECYCLABLE', entityType: 'RecyclableSubmission', entityId: sub._id, req });
  res.json(updated);
});

const rejectRecyclableSubmission = asyncHandler(async (req, res) => {
  const sub = await RecyclableSubmission.findById(req.params.id).lean();
  if (!sub) throw notFound('Submission not found');
  const t = await Task.findById(sub.taskId).lean();
  if (!t) throw notFound('Task not found');
  if (!(await crewHasAccessToTask(req.user._id, t))) throw forbidden('Not allowed');

  // NOTE: recyclableService expects crewUserId
  const updated = await rejectRecyclable({ submissionId: sub._id, crewUserId: req.user._id, note: req.body.reason || '' });
  await audit({ actorUserId: req.user._id, action: 'CREW_REJECT_RECYCLABLE', entityType: 'RecyclableSubmission', entityId: sub._id, req });
  res.json(updated);
});

module.exports = { getTodayRoute, listMyTasks, updateTaskStatus, uploadProof, verifyRecyclableSubmission, rejectRecyclableSubmission };

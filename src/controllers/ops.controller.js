const asyncHandler = require('../utils/asyncHandler');
const Case = require('../models/Case');
const Task = require('../models/Task');
const RewardClaim = require('../models/RewardClaim');
const { CASE_STATUSES, TASK_STATUSES } = require('../config/constants');
const { notFound, badRequest } = require('../utils/errors');
const { audit } = require('../services/auditService');
const { createTaskForCase } = require('../services/taskService');
const { aggregateAll, listVirtualBinTwins } = require('../services/virtualBinService');
const { generateRoutesForDate, publishRoute, getRoutes } = require('../services/routeService');
const { approveClaim, rejectClaim } = require('../services/rewardService');
const { generateMonthlyInvoices } = require('../services/billingService');
const { updateVehicleLocation } = require('../services/vehicleLocationService');
const dayjs = require('dayjs');

function openFromStatus(status) {
  return !['COMPLETED', 'FAILED', 'CANCELLED', 'REJECTED'].includes(status);
}

const listCases = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.status) q.status = req.query.status;
  if (req.query.type) q.type = req.query.type;
  if (req.query.zoneId) q.zoneId = req.query.zoneId;
  const items = await Case.find(q).sort({ createdAt: -1 }).limit(300).lean();
  res.json({ items });
});

const approveCase = asyncHandler(async (req, res) => {
  const c = await Case.findById(req.params.id);
  if (!c) throw notFound('Case not found');
  if (c.status === CASE_STATUSES.REJECTED) throw badRequest('Cannot approve rejected case');

  c.status = CASE_STATUSES.APPROVED;
  c.isOpen = openFromStatus(c.status);
  c.validation = { status: 'APPROVED', validatedByUserId: req.user._id, validatedAt: new Date(), note: req.body.note || '' };
  if (req.body.priority) c.priority = req.body.priority;
  await c.save();

  let task = await Task.findOne({ caseId: c._id });
  if (!task) {
    task = await createTaskForCase(c, { scheduledDate: req.body.scheduledDate || null });
  } else {
    await Task.updateOne({ _id: task._id }, { $set: { scheduledDate: req.body.scheduledDate || task.scheduledDate } });
    task = await Task.findById(task._id).lean();
  }

  await audit({ actorUserId: req.user._id, action: 'OPS_APPROVE_CASE', entityType: 'Case', entityId: c._id, meta: { scheduledDate: req.body.scheduledDate || null }, req });

  res.json({ case: c, task });
});

const rejectCase = asyncHandler(async (req, res) => {
  const c = await Case.findById(req.params.id);
  if (!c) throw notFound('Case not found');

  c.status = CASE_STATUSES.REJECTED;
  c.isOpen = false;
  c.validation = { status: 'REJECTED', validatedByUserId: req.user._id, validatedAt: new Date(), note: req.body.note || '' };
  await c.save();

  await audit({ actorUserId: req.user._id, action: 'OPS_REJECT_CASE', entityType: 'Case', entityId: c._id, req });
  res.json({ case: c });
});

const listTasks = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.status) q.status = req.query.status;
  if (req.query.requiredVehicle) q.requiredVehicle = req.query.requiredVehicle;
  if (req.query.vehicleId) q.vehicleId = req.query.vehicleId;
  const items = await Task.find(q).sort({ createdAt: -1 }).limit(500).lean();
  res.json({ items });
});

const assignTask = asyncHandler(async (req, res) => {
  const t = await Task.findById(req.params.id);
  if (!t) throw notFound('Task not found');

  t.assignedToUserId = req.body.assignedToUserId || t.assignedToUserId;
  t.vehicleId = req.body.vehicleId || t.vehicleId;
  t.scheduledDate = req.body.scheduledDate || t.scheduledDate;
  t.status = TASK_STATUSES.ASSIGNED;
  await t.save();

  await audit({ actorUserId: req.user._id, action: 'OPS_ASSIGN_TASK', entityType: 'Task', entityId: t._id, meta: { vehicleId: t.vehicleId }, req });
  res.json({ task: t });
});

const generateRoutes = asyncHandler(async (req, res) => {
  const date = req.body.date || dayjs().format('YYYY-MM-DD');
  const createdRoutes = await generateRoutesForDate({ date, createdByUserId: req.user._id });
  await audit({ actorUserId: req.user._id, action: 'OPS_GENERATE_ROUTES', entityType: 'Route', entityId: null, meta: { date, count: createdRoutes.length }, req });
  res.json({ date, createdRoutes });
});

const publishRouteController = asyncHandler(async (req, res) => {
  const route = await publishRoute({ routeId: req.params.id, publishedByUserId: req.user._id });
  if (!route) throw notFound('Route not found');
  await audit({ actorUserId: req.user._id, action: 'OPS_PUBLISH_ROUTE', entityType: 'Route', entityId: route._id, req });
  res.json({ route });
});

const listRoutes = asyncHandler(async (req, res) => {
  const items = await getRoutes({ date: req.query.date || null });
  res.json({ items });
});

const dtAggregate = asyncHandler(async (req, res) => {
  await aggregateAll();
  await audit({ actorUserId: req.user._id, action: 'OPS_DT_AGGREGATE', entityType: 'DigitalTwin', entityId: null, req });
  res.json({ status: 'ok' });
});

const dtList = asyncHandler(async (req, res) => {
  const items = await listVirtualBinTwins({ zoneId: req.query.zoneId || null });
  res.json({ items });
});

const listRewardClaims = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.status) q.status = req.query.status;
  const items = await RewardClaim.find(q).sort({ createdAt: -1 }).limit(300).lean();
  res.json({ items });
});

const approveRewardClaim = asyncHandler(async (req, res) => {
  const claim = await approveClaim({ claimId: req.params.id, reviewerUserId: req.user._id, note: req.body.note || '' });
  await audit({ actorUserId: req.user._id, action: 'OPS_APPROVE_REWARD', entityType: 'RewardClaim', entityId: claim._id, req });
  res.json({ claim });
});

const rejectRewardClaim = asyncHandler(async (req, res) => {
  const claim = await rejectClaim({ claimId: req.params.id, reviewerUserId: req.user._id, note: req.body.note || '' });
  await audit({ actorUserId: req.user._id, action: 'OPS_REJECT_REWARD', entityType: 'RewardClaim', entityId: claim._id, req });
  res.json({ claim });
});

const generateInvoices = asyncHandler(async (req, res) => {
  const month = req.body.month || dayjs().subtract(1, 'month').format('YYYY-MM');
  const results = await generateMonthlyInvoices({ month });
  await audit({ actorUserId: req.user._id, action: 'OPS_GENERATE_INVOICES', entityType: 'Invoice', entityId: null, meta: { month, count: results.length }, req });
  res.json({ month, results });
});

// ✅ Manual vehicle (truck) location update for geo-fence alerts (testing)
// Body: { coordinates: [lng, lat], date?: 'YYYY-MM-DD', source?: 'MANUAL'|'MOBILE' }
const postVehicleLocation = asyncHandler(async (req, res) => {
  const vehicleId = req.params.vehicleId;
  const coordinates = req.body.coordinates;
  const source = req.body.source || 'MANUAL';
  const date = req.body.date || null;

  const result = await updateVehicleLocation({ vehicleId, coordinates, source, date });
  await audit({ actorUserId: req.user._id, action: 'OPS_VEHICLE_LOCATION_UPDATE', entityType: 'VehicleLocation', entityId: result.location?._id || null, meta: { vehicleId, alertsSent: result.alertsSent }, req });
  res.status(201).json(result);
});

module.exports = {
  listCases,
  approveCase,
  rejectCase,
  listTasks,
  assignTask,
  generateRoutes,
  publishRouteController,
  listRoutes,
  dtAggregate,
  dtList,
  listRewardClaims,
  approveRewardClaim,
  rejectRewardClaim,
  generateInvoices,
  postVehicleLocation
};

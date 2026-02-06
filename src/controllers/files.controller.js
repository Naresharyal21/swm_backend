const asyncHandler = require('../utils/asyncHandler');
const Evidence = require('../models/Evidence');
const Task = require('../models/Task');
const Vehicle = require('../models/Vehicle');
const { getDownloadUrl } = require('../services/s3Service');
const { notFound, forbidden } = require('../utils/errors');
const { ROLES } = require('../config/constants');

async function crewCanAccessTask(userId, taskId) {
  const t = await Task.findById(taskId).select('assignedToUserId vehicleId').lean();
  if (!t) return false;
  if (t.assignedToUserId && String(t.assignedToUserId) === String(userId)) return true;
  if (t.vehicleId) {
    const v = await Vehicle.findById(t.vehicleId).select('crewUserIds').lean();
    if (v && (v.crewUserIds || []).some(id => String(id) === String(userId))) return true;
  }
  return false;
}

const getEvidenceDownloadUrl = asyncHandler(async (req, res) => {
  const ev = await Evidence.findById(req.params.id).lean();
  if (!ev) throw notFound('Evidence not found');

  const role = req.user.role;
  const userId = req.user._id;

  const isPrivileged = [ROLES.ADMIN, ROLES.SUPERVISOR].includes(role);
  const isOwner = String(ev.ownerUserId) === String(userId);
  const isCrew = role === ROLES.CREW && ev.relatedTaskId && (await crewCanAccessTask(userId, ev.relatedTaskId));

  if (!(isPrivileged || isOwner || isCrew)) throw forbidden('Not allowed');

  const url = await getDownloadUrl({ key: ev.s3Key, expiresInSeconds: 3600 });
  res.json({ url, expiresInSeconds: 3600 });
});

module.exports = { getEvidenceDownloadUrl };

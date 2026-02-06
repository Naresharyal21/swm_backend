const dayjs = require('dayjs');
const VehicleLocation = require('../models/VehicleLocation');
const Task = require('../models/Task');
const Case = require('../models/Case');
const Notification = require('../models/Notification');
const { TASK_STATUSES } = require('../config/constants');
const { haversineKm } = require('../utils/geo');
const { createNotification } = require('./notificationService');

const ALERT_RADIUS_KM = 0.5;
const DEBOUNCE_MINUTES = 20;

async function updateVehicleLocation({ vehicleId, coordinates, source = 'MANUAL', date = null }) {
  // coordinates: [lng, lat]
  const locDoc = await VehicleLocation.create({ vehicleId, source, location: { type: 'Point', coordinates } });

  const scheduledDate = date || dayjs().format('YYYY-MM-DD');

  // Candidate tasks for that vehicle on that day
  const activeStatuses = [TASK_STATUSES.ASSIGNED, TASK_STATUSES.CREATED, TASK_STATUSES.ARRIVED, TASK_STATUSES.IN_PROGRESS];
  const tasks = await Task.find({ vehicleId, scheduledDate, status: { $in: activeStatuses } }).select('_id caseId stopLocation').lean();
  if (!tasks.length) return { location: locDoc, alertsSent: 0, tasksChecked: 0 };

  const caseIds = tasks.map(t => t.caseId);
  const cases = await Case.find({ _id: { $in: caseIds } }).select('_id createdByUserId householdId').lean();
  const caseById = new Map(cases.map(c => [String(c._id), c]));

  let alertsSent = 0;
  for (const t of tasks) {
    const c = caseById.get(String(t.caseId));
    if (!c) continue;
    const userId = c.createdByUserId;
    if (!userId) continue;

    const dKm = haversineKm(coordinates, t.stopLocation?.coordinates || [0, 0]);
    if (dKm > ALERT_RADIUS_KM) continue;

    // Debounce: do not send another alert for same user/task/vehicle in last DEBOUNCE_MINUTES
    const since = dayjs().subtract(DEBOUNCE_MINUTES, 'minute').toDate();
    const recent = await Notification.findOne({
      userId,
      kind: 'TRUCK_NEARBY',
      createdAt: { $gte: since },
      'meta.vehicleId': String(vehicleId),
      'meta.taskId': String(t._id)
    }).lean();
    if (recent) continue;

    await createNotification({
      userId,
      kind: 'TRUCK_NEARBY',
      title: 'Truck is near your house',
      message: `Your pickup truck is within ~${Math.round(dKm * 1000)} meters. Please get ready for collection.`,
      meta: { vehicleId: String(vehicleId), taskId: String(t._id), distanceMeters: Math.round(dKm * 1000), scheduledDate }
    });
    alertsSent++;
  }

  return { location: locDoc, alertsSent, tasksChecked: tasks.length };
}

module.exports = { updateVehicleLocation };

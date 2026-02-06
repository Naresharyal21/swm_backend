const Task = require('../models/Task');
const { TASK_STATUSES, REQUIRED_VEHICLE, CASE_TYPES } = require('../config/constants');

function determineRequiredVehicle(caseType, bulkyWeightKg) {
  if (caseType === CASE_TYPES.BIN_SERVICE) return REQUIRED_VEHICLE.TRUCK;
  if (caseType === CASE_TYPES.LITTER) return REQUIRED_VEHICLE.CREW_ONLY;
  if (caseType === CASE_TYPES.BULKY) {
    const w = Number(bulkyWeightKg || 0);
    return w <= 100 ? REQUIRED_VEHICLE.SCOOTER : REQUIRED_VEHICLE.TRUCK;
  }
  if (caseType === CASE_TYPES.ROUTINE_PICKUP) return REQUIRED_VEHICLE.TRUCK;
  if (caseType === CASE_TYPES.RECYCLABLE) return REQUIRED_VEHICLE.TRUCK;
  return REQUIRED_VEHICLE.TRUCK;
}

async function createTaskForCase(caseDoc, { scheduledDate = null } = {}) {
  const requiredVehicle = determineRequiredVehicle(caseDoc.type, caseDoc.bulkyWeightKg);
  const task = await Task.create({
    caseId: caseDoc._id,
    requiredVehicle,
    estimatedWeightKg: caseDoc.bulkyWeightKg || null,
    status: TASK_STATUSES.CREATED,
    scheduledDate,
    stopLocation: caseDoc.location || { type: 'Point', coordinates: [0, 0] }
  });
  return task;
}

module.exports = { determineRequiredVehicle, createTaskForCase };

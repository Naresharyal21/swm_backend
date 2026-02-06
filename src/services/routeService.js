const Route = require('../models/Route');
const RouteStop = require('../models/RouteStop');
const Vehicle = require('../models/Vehicle');
const Task = require('../models/Task');
const { TASK_STATUSES, REQUIRED_VEHICLE, VEHICLE_TYPES } = require('../config/constants');
const { drivingDistanceKm } = require('./routingService');
const env = require('../config/env');
const { ensureRoutinePickupsForDate } = require('./pickupScheduleService');
const { optimizeWaypointOrder } = require('./googleDirectionsService');

function nearestNeighborOrder(tasks) {
  if (tasks.length <= 1) return tasks;
  const remaining = tasks.slice();
  const ordered = [];
  // start from first (could be vehicle depot in future)
  ordered.push(remaining.shift());
  while (remaining.length) {
    const last = ordered[ordered.length - 1];
    let bestIdx = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = Math.hypot(
        remaining[i].stopLocation.coordinates[0] - last.stopLocation.coordinates[0],
        remaining[i].stopLocation.coordinates[1] - last.stopLocation.coordinates[1]
      );
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }
  return ordered;
}

async function optimizedOrder(tasks) {
  if (!env.googleMaps.useDirectionsOptimization) return nearestNeighborOrder(tasks);
  if (!tasks || tasks.length <= 2) return nearestNeighborOrder(tasks);

  try {
    // Optimize all points by keeping the first as origin and optimizing the rest
    const points = tasks.map(t => t.stopLocation.coordinates);
    const { waypointOrder } = await optimizeWaypointOrder({ points });
    const originTask = tasks[0];
    const remainingTasks = tasks.slice(1);
    const ordered = [originTask, ...waypointOrder.map(idx => remainingTasks[idx])];
    return ordered;
  } catch (err) {
    // Fallback to nearest-neighbor if API fails
    return nearestNeighborOrder(tasks);
  }
}

async function generateRoutesForDate({ date, createdByUserId }) {
  // date: YYYY-MM-DD
  // ✅ Auto-create ROUTINE_PICKUP tasks for households scheduled on this weekday
  await ensureRoutinePickupsForDate({ date });

  const vehicles = await Vehicle.find({ isActive: true }).lean();
  const vehicleByType = {
    [VEHICLE_TYPES.TRUCK]: vehicles.filter(v => v.vehicleType === VEHICLE_TYPES.TRUCK),
    [VEHICLE_TYPES.SCOOTER]: vehicles.filter(v => v.vehicleType === VEHICLE_TYPES.SCOOTER)
  };

  const tasks = await Task.find({
    status: TASK_STATUSES.CREATED,
    requiredVehicle: { $in: [REQUIRED_VEHICLE.TRUCK, REQUIRED_VEHICLE.SCOOTER] },
    $or: [{ scheduledDate: date }, { scheduledDate: null }]
  }).lean();

  const byReq = {
    [REQUIRED_VEHICLE.TRUCK]: tasks.filter(t => t.requiredVehicle === REQUIRED_VEHICLE.TRUCK),
    [REQUIRED_VEHICLE.SCOOTER]: tasks.filter(t => t.requiredVehicle === REQUIRED_VEHICLE.SCOOTER)
  };

  const createdRoutes = [];

  for (const [req, taskList] of Object.entries(byReq)) {
    const vType = req === REQUIRED_VEHICLE.TRUCK ? VEHICLE_TYPES.TRUCK : VEHICLE_TYPES.SCOOTER;
    const vList = vehicleByType[vType];
    if (!vList.length || !taskList.length) continue;

    // round-robin assignment
    const buckets = vList.map(() => []);
    taskList.forEach((t, idx) => buckets[idx % buckets.length].push(t));

    for (let vi = 0; vi < vList.length; vi++) {
      const vehicle = vList[vi];
      const assigned = buckets[vi];
      if (!assigned.length) continue;

      // version increment
      const last = await Route.findOne({ date, vehicleId: vehicle._id }).sort({ version: -1 }).lean();
      const version = (last?.version || 0) + 1;

      const route = await Route.create({
        date,
        vehicleId: vehicle._id,
        vehicleType: vehicle.vehicleType,
        status: 'DRAFT',
        version,
        createdByUserId
      });

      const ordered = await optimizedOrder(assigned);

      // Create stops + update tasks
      let totalKm = 0;
      for (let i = 0; i < ordered.length; i++) {
        const task = ordered[i];
        if (i > 0) {
          totalKm += await drivingDistanceKm(ordered[i - 1].stopLocation.coordinates, task.stopLocation.coordinates);
        }
        await RouteStop.create({
          routeId: route._id,
          order: i + 1,
          location: task.stopLocation,
          taskIds: [task._id]
        });

        await Task.updateOne(
          { _id: task._id },
          { $set: { status: TASK_STATUSES.ASSIGNED, vehicleId: vehicle._id, scheduledDate: date } }
        );
      }

      createdRoutes.push({ routeId: route._id, vehicleId: vehicle._id, vehicleType: vehicle.vehicleType, stops: ordered.length, estimatedKm: Number(totalKm.toFixed(2)) });
    }
  }

  return createdRoutes;
}

async function publishRoute({ routeId, publishedByUserId }) {
  const route = await Route.findById(routeId);
  if (!route) return null;
  route.status = 'PUBLISHED';
  route.publishedByUserId = publishedByUserId;
  route.publishedAt = new Date();
  await route.save();
  return route;
}

async function getRoutes({ date }) {
  const q = {};
  if (date) q.date = date;
  return Route.find(q).sort({ createdAt: -1 }).lean();
}

async function getPublishedRoutesForCrew({ crewUserId, date }) {
  const vehicles = await Vehicle.find({ crewUserIds: crewUserId, isActive: true }).select('_id').lean();
  if (!vehicles.length) return [];
  const routes = await Route.find({ date, vehicleId: { $in: vehicles.map(v => v._id) }, status: 'PUBLISHED' }).lean();
  const routeIds = routes.map(r => r._id);
  const stops = await RouteStop.find({ routeId: { $in: routeIds } }).sort({ routeId: 1, order: 1 }).lean();
  return routes.map(r => ({ ...r, stops: stops.filter(s => String(s.routeId) === String(r._id)) }));
}

module.exports = { generateRoutesForDate, publishRoute, getRoutes, getPublishedRoutesForCrew };

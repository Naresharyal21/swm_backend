// proc_build_routes_for_today_all_vehicles.js
// Assign tasks to vehicles and create ROUTES + ROUTESTOPS for today (TRUCK + SCOOTER).
//
// Run:
//   mongosh "mongodb://localhost:27017/smartwaste" .\scripts\proc_build_routes_for_today_all_vehicles.js
//
// Optional env:
//   DB_NAME=smartwaste
//   TARGET_DATE=YYYY-MM-DD        (default: today local)
//   SYSTEM_USER_EMAIL=admin@demo.local
//   ROUTE_STATUS=DRAFT            (default: DRAFT)
//   SHIFT_START=06:00             (default: 06:00)
//   TRUCK_SPEED_KMPH=18           (default: 18)
//   SCOOTER_SPEED_KMPH=22         (default: 22)
//   TASK_FILTER_STATUSES=SCHEDULED,PENDING  (default)
//   ASSIGNED_TASK_STATUS=ASSIGNED (default)
//   REBUILD_DRAFT=true            (default: true; if DRAFT route exists for today, reuse & rebuild stops)

function formatLocalYYYYMMDD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseHHMM(hhmm) {
  const [h, m] = (hhmm || '06:00').split(':').map((x) => Number(x));
  return { h: Number.isFinite(h) ? h : 6, m: Number.isFinite(m) ? m : 0 };
}

function makeLocalDateFromYYYYMMDDHHMM(ymd, hhmm) {
  const [Y, M, D] = ymd.split('-').map((x) => Number(x));
  const { h, m } = parseHHMM(hhmm);
  return new Date(Y, (M - 1), D, h, m, 0, 0);
}

function toKey(lng, lat) {
  return `${Number(lng).toFixed(6)},${Number(lat).toFixed(6)}`;
}

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const lat1 = a.lat, lon1 = a.lng, lat2 = b.lat, lon2 = b.lng;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const q =
    s1 * s1 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(q)));
}

// Nearest-neighbor ordering
function orderStopsNearestNeighbor(stops) {
  if (stops.length <= 2) return stops;

  const remaining = stops.slice();
  const ordered = [];

  // start from the first stop
  let current = remaining.shift();
  ordered.push(current);

  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(current._p, remaining[i]._p);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    current = remaining.splice(bestIdx, 1)[0];
    ordered.push(current);
  }
  return ordered;
}

const DB_NAME =
  process.env.DB_NAME || (db && db.getName ? db.getName() : 'smartwaste');
const TARGET_DATE = process.env.TARGET_DATE || formatLocalYYYYMMDD(new Date());
const SYSTEM_USER_EMAIL = (process.env.SYSTEM_USER_EMAIL || 'admin@demo.local').toLowerCase();

const ROUTE_STATUS = process.env.ROUTE_STATUS || 'DRAFT';
const SHIFT_START = process.env.SHIFT_START || '06:00';
const TRUCK_SPEED_KMPH = Number(process.env.TRUCK_SPEED_KMPH || 18);
const SCOOTER_SPEED_KMPH = Number(process.env.SCOOTER_SPEED_KMPH || 22);

const TASK_FILTER_STATUSES = (process.env.TASK_FILTER_STATUSES || 'SCHEDULED,PENDING')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const ASSIGNED_TASK_STATUS = process.env.ASSIGNED_TASK_STATUS || 'ASSIGNED';
const REBUILD_DRAFT = String(process.env.REBUILD_DRAFT || 'true').toLowerCase() === 'true';

const dbRef = db.getSiblingDB(DB_NAME);

print(`\n=== Procedure: build ROUTES for today (DB=${DB_NAME}, TARGET_DATE=${TARGET_DATE}) ===\n`);

const systemUser = dbRef.users.findOne(
  { email: SYSTEM_USER_EMAIL },
  { _id: 1, email: 1, role: 1 }
);
if (!systemUser) {
  throw new Error(`System user not found: ${SYSTEM_USER_EMAIL}. Create it first or set SYSTEM_USER_EMAIL.`);
}

// Load active vehicles (both types)
const vehicles = dbRef.vehicles.find({ isActive: true }).toArray();
const trucks = vehicles.filter((v) => v.vehicleType === 'TRUCK');
const scooters = vehicles.filter((v) => v.vehicleType === 'SCOOTER');

if (!trucks.length && !scooters.length) {
  print('No active vehicles found. Nothing to build.');
  quit(0);
}

function assignTasksToVehicles(vehicleType, vehicleList) {
  if (!vehicleList.length) return { assigned: 0, byVehicle: new Map() };

  // tasks scheduled today, not assigned, matching type
  const tasks = dbRef.tasks.find({
    scheduledDate: TARGET_DATE,
    requiredVehicle: vehicleType,
    vehicleId: null,
    status: { $in: TASK_FILTER_STATUSES }
  }).toArray();

  if (!tasks.length) return { assigned: 0, byVehicle: new Map() };

  const byVehicle = new Map();
  vehicleList.forEach((v) => byVehicle.set(String(v._id), []));

  // round-robin assignment
  for (let i = 0; i < tasks.length; i++) {
    const v = vehicleList[i % vehicleList.length];
    byVehicle.get(String(v._id)).push(tasks[i]);
  }

  // apply assignment in DB
  const now = new Date();
  const ops = [];
  for (const [vid, ts] of byVehicle.entries()) {
    for (const t of ts) {
      ops.push({
        updateOne: {
          filter: { _id: t._id },
          update: { $set: { vehicleId: ObjectId(vid), status: ASSIGNED_TASK_STATUS, updatedAt: now } }
        }
      });
    }
  }
  if (ops.length) dbRef.tasks.bulkWrite(ops, { ordered: false });

  return { assigned: tasks.length, byVehicle };
}

function buildRouteForVehicle(vehicle, tasksForVehicle) {
  if (!tasksForVehicle.length) return { routeId: null, stopsInserted: 0 };

  const now = new Date();

  // Find latest route for this date+vehicle
  const existing = dbRef.routes
    .find({ date: TARGET_DATE, vehicleId: vehicle._id })
    .sort({ version: -1 })
    .limit(1)
    .toArray()[0];

  let routeDoc;
  let reuseRoute = false;

  if (existing && existing.status === 'DRAFT' && REBUILD_DRAFT) {
    reuseRoute = true;
    routeDoc = existing;

    // wipe existing stops
    dbRef.routestops.deleteMany({ routeId: routeDoc._id });
  } else {
    const nextVersion = existing ? Number(existing.version || 1) + 1 : 1;

    routeDoc = {
      date: TARGET_DATE,
      vehicleId: vehicle._id,
      vehicleType: vehicle.vehicleType,
      status: ROUTE_STATUS,
      version: nextVersion,
      createdByUserId: systemUser._id,
      publishedByUserId: null,
      publishedAt: null,
      createdAt: now,
      updatedAt: now
    };

    const ins = dbRef.routes.insertOne(routeDoc);
    routeDoc._id = ins.insertedId;
  }

  // Group tasks by exact stop location (so one stop can contain multiple tasks)
  const grouped = new Map();
  for (const t of tasksForVehicle) {
    const loc = t.stopLocation;
    if (!loc || loc.type !== 'Point' || !Array.isArray(loc.coordinates) || loc.coordinates.length !== 2) continue;
    const [lng, lat] = loc.coordinates;
    const key = toKey(lng, lat);
    if (!grouped.has(key)) {
      grouped.set(key, { location: loc, taskIds: [], _p: { lat, lng } });
    }
    grouped.get(key).taskIds.push(t._id);
  }

  // Build stop list and order it
  const stops = Array.from(grouped.values());
  const orderedStops = orderStopsNearestNeighbor(stops);

  // ETA calculations (simple distance-based estimate)
  const speed = (vehicle.vehicleType === 'TRUCK') ? TRUCK_SPEED_KMPH : SCOOTER_SPEED_KMPH;
  let startTime = makeLocalDateFromYYYYMMDDHHMM(TARGET_DATE, SHIFT_START);

  const stopDocs = [];
  let totalKm = 0;

  for (let i = 0; i < orderedStops.length; i++) {
    const s = orderedStops[i];

    let legKm = 0;
    if (i > 0) {
      legKm = haversineKm(orderedStops[i - 1]._p, s._p);
      totalKm += legKm;
    }

    const legMin = (speed > 0) ? (legKm / speed) * 60 : 0;
    startTime = new Date(startTime.getTime() + legMin * 60 * 1000);

    stopDocs.push({
      routeId: routeDoc._id,
      order: i + 1,
      location: s.location,
      taskIds: s.taskIds,
      eta: startTime,
      distanceKm: Number((legKm).toFixed(3)),
      durationMin: Number((legMin).toFixed(1)),
      createdAt: now,
      updatedAt: now
    });
  }

  if (stopDocs.length) dbRef.routestops.insertMany(stopDocs, { ordered: false });

  // Update route updatedAt
  dbRef.routes.updateOne(
    { _id: routeDoc._id },
    { $set: { updatedAt: new Date() } }
  );

  return { routeId: routeDoc._id, stopsInserted: stopDocs.length, reuseRoute };
}

// 1) Assign tasks to vehicles (both types)
const truckAssign = assignTasksToVehicles('TRUCK', trucks);
const scooterAssign = assignTasksToVehicles('SCOOTER', scooters);

print(`Assigned tasks: TRUCK=${truckAssign.assigned}, SCOOTER=${scooterAssign.assigned}`);

// 2) Build routes per vehicle
let routesCreated = 0;
let stopsCreated = 0;

function buildForType(vehicleList) {
  for (const v of vehicleList) {
    const tasksForV = dbRef.tasks.find({
      scheduledDate: TARGET_DATE,
      vehicleId: v._id,
      status: ASSIGNED_TASK_STATUS
    }).toArray();

    const out = buildRouteForVehicle(v, tasksForV);
    if (out.routeId) {
      routesCreated++;
      stopsCreated += out.stopsInserted;
      print(`- ${v.vehicleType} ${v.code}: route=${out.routeId} stops=${out.stopsInserted} ${out.reuseRoute ? '(rebuilt DRAFT)' : ''}`);
    }
  }
}

buildForType(trucks);
buildForType(scooters);

print(`\n✅ Done. Routes created/updated=${routesCreated}, RouteStops inserted=${stopsCreated}\n`);

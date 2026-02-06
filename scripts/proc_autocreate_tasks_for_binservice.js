// proc_autocreate_tasks_for_binservice.js
// Create TASKs for open BIN_SERVICE cases (idempotent: one task per case).
//
// Run:
//   mongosh "mongodb://localhost:27017/smartwaste" .\scripts\proc_autocreate_tasks_for_binservice.js
//
// Optional env:
//   DB_NAME=smartwaste
//   TARGET_DATE=YYYY-MM-DD        (default: today local)
//   CASE_STATUSES=PENDING_VALIDATION,APPROVED (default)
//   TASK_STATUS=SCHEDULED         (default: SCHEDULED)
//   PRIORITY_TRUCK_MIN=2          (default: 2)
//   SYSTEM_USER_EMAIL=admin@demo.local

function formatLocalYYYYMMDD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DB_NAME =
  process.env.DB_NAME || (db && db.getName ? db.getName() : 'smartwaste');
const TARGET_DATE = process.env.TARGET_DATE || formatLocalYYYYMMDD(new Date());
const CASE_STATUSES = (process.env.CASE_STATUSES || 'PENDING_VALIDATION,APPROVED')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const TASK_STATUS = process.env.TASK_STATUS || 'SCHEDULED';
const PRIORITY_TRUCK_MIN = Number(process.env.PRIORITY_TRUCK_MIN || 2);
const SYSTEM_USER_EMAIL = (process.env.SYSTEM_USER_EMAIL || 'admin@demo.local').toLowerCase();

const dbRef = db.getSiblingDB(DB_NAME);

print(`\n=== Procedure: auto-create TASKS for BIN_SERVICE (DB=${DB_NAME}, TARGET_DATE=${TARGET_DATE}) ===\n`);

const systemUser = dbRef.users.findOne(
  { email: SYSTEM_USER_EMAIL },
  { _id: 1, email: 1, role: 1 }
);
if (!systemUser) {
  throw new Error(`System user not found: ${SYSTEM_USER_EMAIL}. Create it first or set SYSTEM_USER_EMAIL.`);
}

// Find open BIN_SERVICE cases, allowed statuses, that do NOT already have a task
const casesNoTask = dbRef.cases.aggregate([
  {
    $match: {
      type: 'BIN_SERVICE',
      isOpen: true,
      status: { $in: CASE_STATUSES }
    }
  },
  {
    $lookup: {
      from: 'tasks',
      localField: '_id',
      foreignField: 'caseId',
      as: 't'
    }
  },
  { $match: { t: { $size: 0 } } },
  { $project: { _id: 1, location: 1, priority: 1 } }
]).toArray();

if (!casesNoTask.length) {
  print('No eligible BIN_SERVICE cases without tasks. Nothing to create.');
  quit(0);
}

const now = new Date();

const ops = casesNoTask.map((c) => {
  const requiredVehicle = (Number(c.priority || 0) >= PRIORITY_TRUCK_MIN) ? 'TRUCK' : 'SCOOTER';
  const stopLocation =
    (c.location && c.location.type === 'Point') ? c.location : { type: 'Point', coordinates: [0, 0] };

  return {
    updateOne: {
      filter: { caseId: c._id }, // one task per case
      update: {
        $setOnInsert: {
          caseId: c._id,
          requiredVehicle,
          estimatedWeightKg: null,
          status: TASK_STATUS,
          assignedToUserId: null,
          vehicleId: null,
          scheduledDate: TARGET_DATE,
          startedAt: null,
          completedAt: null,
          proofEvidenceId: null,
          failureReason: '',
          stopLocation,
          createdAt: now,
          updatedAt: now
        }
      },
      upsert: true
    }
  };
});

const res = dbRef.tasks.bulkWrite(ops, { ordered: false });
print(`✅ Done. Upserted=${res.upsertedCount}, MatchedExisting=${res.matchedCount}`);
print('Note: MatchedExisting means a task already existed for that case (no new insert).');

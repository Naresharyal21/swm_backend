// proc_autocreate_bin_service_cases.js
// Auto-creates BIN_SERVICE cases for risky virtual bins (riskScore >= threshold).
// Threshold is per-virtual-bin if set (virtualbins.thresholds.risk), otherwise DEFAULT_RISK_THRESHOLD.
//
// Run:
//   mongosh "mongodb://127.0.0.1:27017/smartwaste" proc_autocreate_bin_service_cases.js
//
// Optional env:
//   DB_NAME=smartwaste
//   DEFAULT_RISK_THRESHOLD=70
//   SLA_HOURS=8
//   SYSTEM_USER_EMAIL=admin@demo.local
//   CASE_STATUS=PENDING_VALIDATION

const DB_NAME =
  process.env.DB_NAME || (db && db.getName ? db.getName() : 'smartwaste');

const DEFAULT_RISK_THRESHOLD = Number(process.env.DEFAULT_RISK_THRESHOLD || 70);
const SLA_HOURS = Number(process.env.SLA_HOURS || 8);
const SYSTEM_USER_EMAIL = process.env.SYSTEM_USER_EMAIL || 'admin@demo.local';
const CASE_STATUS = process.env.CASE_STATUS || 'PENDING_VALIDATION';

const dbRef = db.getSiblingDB(DB_NAME);
print(`\n=== Procedure: auto-create BIN_SERVICE cases (DB=${DB_NAME}) ===\n`);

const systemUser = dbRef.users.findOne(
  { email: SYSTEM_USER_EMAIL.toLowerCase() },
  { _id: 1, email: 1, role: 1 }
);

if (!systemUser) {
  throw new Error(
    `System user not found: ${SYSTEM_USER_EMAIL}. Create it first or set SYSTEM_USER_EMAIL.`
  );
}

const now = new Date();
const slaDeadline = new Date(now.getTime() + SLA_HOURS * 60 * 60 * 1000);

// Find risky virtual bins with their thresholds and centroid.
// Improvements:
//  - If VirtualBin centroid is missing, fall back to Zone centroid.
//  - Priority based on riskScore.
//  - Keep per-VB thresholds, fallback to DEFAULT_RISK_THRESHOLD.
const risky = dbRef.virtualbintwins
  .aggregate([
    {
      $lookup: {
        from: 'virtualbins',
        localField: 'virtualBinId',
        foreignField: '_id',
        as: 'vb'
      }
    },
    { $unwind: { path: '$vb', preserveNullAndEmptyArrays: false } },
    { $match: { 'vb.isActive': true } },

    // Zone fallback (for centroid, ward context, etc.)
    {
      $lookup: {
        from: 'zones',
        localField: 'vb.zoneId',
        foreignField: '_id',
        as: 'zone'
      }
    },
    { $unwind: { path: '$zone', preserveNullAndEmptyArrays: true } },

    {
      $addFields: {
        riskThreshold: { $ifNull: ['$vb.thresholds.risk', DEFAULT_RISK_THRESHOLD] }
      }
    },
    {
      $match: {
        $expr: { $gte: ['$riskScore', '$riskThreshold'] }
      }
    },
    {
      $project: {
        virtualBinId: 1,
        zoneId: '$vb.zoneId',
        vbCentroid: '$vb.centroid',
        zoneCentroid: '$zone.centroid',
        riskScore: 1,
        riskThreshold: 1
      }
    }
  ])
  .toArray();

if (!risky.length) {
  print('No risky virtual bins found. Nothing to create.');
  quit(0);
}

function pickPoint(vbCentroid, zoneCentroid) {
  if (vbCentroid && vbCentroid.type === 'Point') return vbCentroid;
  if (zoneCentroid && zoneCentroid.type === 'Point') return zoneCentroid;
  return { type: 'Point', coordinates: [0, 0] };
}

function calcPriority(riskScore) {
  if (riskScore >= 90) return 3; // Critical
  if (riskScore >= 70) return 2; // High
  return 1; // Medium/Low
}

// Bulk upsert: only inserts if there is no open BIN_SERVICE case for that virtualBinId
const ops = risky.map((r) => {
  const loc = pickPoint(r.vbCentroid, r.zoneCentroid);
  const desc = `Auto-created BIN_SERVICE (riskScore=${r.riskScore}, threshold=${r.riskThreshold})`;
  const priority = calcPriority(r.riskScore);

  return {
    updateOne: {
      filter: {
        virtualBinId: r.virtualBinId,
        type: 'BIN_SERVICE',
        isOpen: true
      },
      update: {
        $setOnInsert: {
          type: 'BIN_SERVICE',
          status: CASE_STATUS,
          isOpen: true,
          createdByUserId: systemUser._id,
          householdId: null,
          zoneId: r.zoneId || null,
          virtualBinId: r.virtualBinId,
          location: loc,
          description: desc,
          bulkyWeightKg: null,
          priority,
          slaDeadline,
          validation: { validatedByUserId: null, validatedAt: null, note: '' },
          createdAt: now,
          updatedAt: now
        }
      },
      upsert: true
    }
  };
});

const result = dbRef.cases.bulkWrite(ops, { ordered: false });
print(`✅ Done. Upserted=${result.upsertedCount}, MatchedExisting=${result.matchedCount}`);
print('Note: MatchedExisting means an open BIN_SERVICE case already existed (no new insert).');

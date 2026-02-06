// proc_compute_virtualbintwins.js
// Recompute virtualbintwins from live bintwinlatests (BinTwinLatest)
// and calculate a calibrated riskScore (0..100) suitable for an ABSOLUTE threshold (e.g., 70).
//
// Run:
//   mongosh "mongodb://localhost:27017/smartwaste" .\scripts\proc_compute_virtualbintwins.js
//
// Optional env:
//   DB_NAME=smartwaste
//   ONLY_ACTIVE=true
//
// Risk weights (defaults tuned for ABS threshold=70):
//   W_MAXFILL=0.45     // contributes up to 45
//   W_AVGFILL=0.25     // contributes up to 25
//   W_OVER80=20        // contributes up to 20 (fraction 0..1)
//   W_OVER95=30        // contributes up to 30 (fraction 0..1)
//   W_OFFLINE=20       // contributes up to 20 (fraction 0..1)
//
// riskScore = min(100, round(
//   W_MAXFILL*maxFill +
//   W_AVGFILL*avgFill +
//   W_OVER80*pctOver80 +
//   W_OVER95*pctOver95 +
//   W_OFFLINE*offlinePct
// ))

const DB_NAME = process.env.DB_NAME || (db && db.getName ? db.getName() : 'smartwaste');
const ONLY_ACTIVE = String(process.env.ONLY_ACTIVE || 'true').toLowerCase() === 'true';

const W_MAXFILL = Number(process.env.W_MAXFILL || 0.45);
const W_AVGFILL = Number(process.env.W_AVGFILL || 0.25);
const W_OVER80 = Number(process.env.W_OVER80 || 20);
const W_OVER95 = Number(process.env.W_OVER95 || 30);
const W_OFFLINE = Number(process.env.W_OFFLINE || 20);

const dbRef = db.getSiblingDB(DB_NAME);
const now = new Date();

print(`\n=== Procedure: compute virtualbintwins (DB=${DB_NAME}, ONLY_ACTIVE=${ONLY_ACTIVE}) ===\n`);
print(`Risk weights: W_MAXFILL=${W_MAXFILL}, W_AVGFILL=${W_AVGFILL}, W_OVER80=${W_OVER80}, W_OVER95=${W_OVER95}, W_OFFLINE=${W_OFFLINE}\n`);

const pipeline = [
  // Start from live latest digital twin snapshots
  { $match: { binId: { $type: 'objectId' } } },

  // Join to bins to get virtualBinId
  {
    $lookup: {
      from: 'bins',
      localField: 'binId',
      foreignField: '_id',
      as: 'bin'
    }
  },
  { $unwind: { path: '$bin', preserveNullAndEmptyArrays: false } },
  { $match: { 'bin.virtualBinId': { $type: 'objectId' } } },

  // Join to virtualbins to allow ONLY_ACTIVE filtering (and to ensure VB exists)
  {
    $lookup: {
      from: 'virtualbins',
      localField: 'bin.virtualBinId',
      foreignField: '_id',
      as: 'vb'
    }
  },
  { $unwind: { path: '$vb', preserveNullAndEmptyArrays: false } },

  ...(ONLY_ACTIVE ? [{ $match: { 'vb.isActive': true } }] : []),

  // Group by virtual bin and compute aggregates
  {
    $group: {
      _id: '$bin.virtualBinId',
      computedAt: { $first: now },

      binsCount: { $sum: 1 },
      over80Count: { $sum: { $cond: [{ $gte: ['$fillPercent', 80] }, 1, 0] } },
      over95Count: { $sum: { $cond: [{ $gte: ['$fillPercent', 95] }, 1, 0] } },
      offlineCount: { $sum: { $cond: ['$isOffline', 1, 0] } },

      avgFill: { $avg: '$fillPercent' },
      maxFill: { $max: '$fillPercent' }
    }
  },

  // Derive percentages
  {
    $addFields: {
      pctOver80: {
        $cond: [{ $gt: ['$binsCount', 0] }, { $divide: ['$over80Count', '$binsCount'] }, 0]
      },
      pctOver95: {
        $cond: [{ $gt: ['$binsCount', 0] }, { $divide: ['$over95Count', '$binsCount'] }, 0]
      },
      offlinePct: {
        $cond: [{ $gt: ['$binsCount', 0] }, { $divide: ['$offlineCount', '$binsCount'] }, 0]
      }
    }
  },

  // Calibrated absolute-scale risk score (0..100)
  {
    $addFields: {
      riskScore: {
        $min: [
          100,
          {
            $round: [
              {
                $add: [
                  { $multiply: [W_MAXFILL, '$maxFill'] },
                  { $multiply: [W_AVGFILL, '$avgFill'] },
                  { $multiply: [W_OVER80, '$pctOver80'] },
                  { $multiply: [W_OVER95, '$pctOver95'] },
                  { $multiply: [W_OFFLINE, '$offlinePct'] }
                ]
              },
              0
            ]
          }
        ]
      }
    }
  },

  // Shape doc to match your collection validator
  {
    $project: {
      _id: 0,
      virtualBinId: '$_id',
      computedAt: 1,
      binsCount: 1,
      over80Count: 1,
      over95Count: 1,
      offlineCount: 1,
      avgFill: { $round: ['$avgFill', 2] },
      maxFill: 1,
      pctOver80: { $round: ['$pctOver80', 4] },
      pctOver95: { $round: ['$pctOver95', 4] },
      offlinePct: { $round: ['$offlinePct', 4] },
      riskScore: 1,
      createdAt: now,
      updatedAt: now
    }
  }
];

const rows = dbRef.bintwinlatests.aggregate(pipeline, { allowDiskUse: true }).toArray();

if (!rows.length) {
  print('No rows computed (check bintwinlatests, bins.virtualBinId, virtualbins).');
  quit(0);
}

const ops = rows.map((r) => ({
  updateOne: {
    filter: { virtualBinId: r.virtualBinId },
    update: { $set: r },
    upsert: true
  }
}));

const res = dbRef.virtualbintwins.bulkWrite(ops, { ordered: false });

print('✅ virtualbintwins recomputed and upserted.');
print(`Upserted=${res.upsertedCount}, MatchedExisting=${res.matchedCount}, Modified=${res.modifiedCount}`);

// Helpful summary
const summary = dbRef.virtualbintwins.aggregate([
  { $group: { _id: null, max: { $max: '$riskScore' }, avg: { $avg: '$riskScore' }, min: { $min: '$riskScore' } } }
]).toArray();

print('\nRisk summary (after compute):');
printjson(summary);

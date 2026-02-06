// proc_generate_monthly_invoices.js
// Generates monthly invoices for CITIZEN households efficiently (monthly fee + bulky pickup charges).
// Idempotent: uses upsert with $setOnInsert so re-running won't overwrite existing invoices.
//
// Run:
//   TARGET_MONTH=2026-01 mongosh "mongodb://127.0.0.1:27017/smartwaste" proc_generate_monthly_invoices.js
//
// Optional env:
//   DB_NAME=smartwaste
//   TARGET_MONTH=YYYY-MM
//   DEFAULT_MONTHLY_FEE=200
//   DEFAULT_BULKY_DAILY_CHARGE=50
//   APPLY_WALLET_CREDITS=true|false
//
// Notes:
// - Bulky charge is computed as (days between case.createdAt and task.completedAt, min 1) * bulkyDailyCharge.
// - bulkyDailyCharge = billingplans.bulkyDailyChargeOverride if set, else DEFAULT_BULKY_DAILY_CHARGE.
// - Wallet credits are optional; if APPLY_WALLET_CREDITS=true, invoice.creditsApplied is set but wallet is NOT debited.

const DB_NAME = process.env.DB_NAME || (db && db.getName ? db.getName() : 'smartwaste');
const TARGET_MONTH = process.env.TARGET_MONTH; // required
const DEFAULT_MONTHLY_FEE = Number(process.env.DEFAULT_MONTHLY_FEE || 200);
const DEFAULT_BULKY_DAILY_CHARGE = Number(process.env.DEFAULT_BULKY_DAILY_CHARGE || 50);
const APPLY_WALLET_CREDITS = (process.env.APPLY_WALLET_CREDITS || 'false').toLowerCase() === 'true';

if (!TARGET_MONTH || !/^\d{4}-\d{2}$/.test(TARGET_MONTH)) {
  throw new Error('Set TARGET_MONTH=YYYY-MM (example: TARGET_MONTH=2026-01)');
}

const dbRef = db.getSiblingDB(DB_NAME);
print(`\n=== Procedure: generate invoices (DB=${DB_NAME}, TARGET_MONTH=${TARGET_MONTH}, APPLY_WALLET_CREDITS=${APPLY_WALLET_CREDITS}) ===\n`);

// Compute month window [start, end)
const year = Number(TARGET_MONTH.slice(0, 4));
const monthIdx = Number(TARGET_MONTH.slice(5, 7)) - 1; // 0-based
const start = new Date(Date.UTC(year, monthIdx, 1, 0, 0, 0));
const end = new Date(Date.UTC(year, monthIdx + 1, 1, 0, 0, 0));

// Build invoices via aggregation from households
const invoices = dbRef.households
  .aggregate([
    // Only households that are linked to a citizen user
    { $match: { citizenUserId: { $type: 'objectId' } } },

    // Join plan
    {
      $lookup: {
        from: 'billingplans',
        localField: 'planId',
        foreignField: '_id',
        as: 'plan'
      }
    },
    { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },

    // Compute fees / charges config
    {
      $addFields: {
        monthlyFee: { $ifNull: ['$plan.monthlyFee', DEFAULT_MONTHLY_FEE] },
        bulkyDailyCharge: { $ifNull: ['$plan.bulkyDailyChargeOverride', DEFAULT_BULKY_DAILY_CHARGE] }
      }
    },

    // Bulky charges for this household, based on completed tasks in the target month with proof
    {
      $lookup: {
        from: 'tasks',
        let: { hid: '$_id', dailyCharge: '$bulkyDailyCharge' },
        pipeline: [
          {
            $match: {
              status: 'COMPLETED',
              completedAt: { $gte: start, $lt: end },
              proofEvidenceId: { $type: 'objectId' }
            }
          },
          { $lookup: { from: 'cases', localField: 'caseId', foreignField: '_id', as: 'c' } },
          { $unwind: '$c' },
          { $match: { 'c.type': 'BULKY', 'c.householdId': { $type: 'objectId' } } },
          { $match: { $expr: { $eq: ['$c.householdId', '$$hid'] } } },

          // days = ceil((completedAt - case.createdAt)/day), min 1
          {
            $addFields: {
              _diffMs: { $subtract: ['$completedAt', '$c.createdAt'] }
            }
          },
          {
            $addFields: {
              _rawDays: {
                $ceil: { $divide: ['$_diffMs', 86400000] }
              }
            }
          },
          {
            $addFields: {
              days: { $cond: [{ $lt: ['$_rawDays', 1] }, 1, '$_rawDays'] },
              itemDate: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } }
            }
          },
          {
            $addFields: {
              amount: { $multiply: ['$$dailyCharge', '$days'] },
              description: {
                $concat: [
                  'Bulky pickup (',
                  { $toString: '$days' },
                  ' day(s))'
                ]
              }
            }
          },

          // Produce invoice item
          {
            $project: {
              _id: 0,
              date: '$itemDate',
              kind: { $literal: 'BULKY' },
              description: 1,
              amount: 1
            }
          }
        ],
        as: 'bulkyItems'
      }
    },

    // Sum bulky amounts
    {
      $addFields: {
        bulkyTotal: { $sum: '$bulkyItems.amount' }
      }
    },

    // Optional: wallet credit balance
    ...(APPLY_WALLET_CREDITS
      ? [
          {
            $lookup: {
              from: 'wallettransactions',
              let: { uid: '$citizenUserId' },
              pipeline: [
                { $match: { $expr: { $eq: ['$userId', '$$uid'] } } },
                {
                  $group: {
                    _id: null,
                    balance: {
                      $sum: {
                        $cond: [
                          { $eq: ['$type', 'CREDIT'] },
                          '$amount',
                          { $multiply: ['$amount', -1] }
                        ]
                      }
                    }
                  }
                }
              ],
              as: 'wallet'
            }
          },
          { $unwind: { path: '$wallet', preserveNullAndEmptyArrays: true } },
          { $addFields: { walletBalance: { $max: [0, { $ifNull: ['$wallet.balance', 0] }] } } }
        ]
      : [{ $addFields: { walletBalance: 0 } }]),

    // Prepare invoice items
    {
      $addFields: {
        baseItems: [
          {
            date: `${TARGET_MONTH}-01`,
            kind: 'MONTHLY_FEE',
            description: { $ifNull: ['$plan.name', 'Monthly Fee'] },
            amount: '$monthlyFee'
          }
        ]
      }
    },
    {
      $addFields: {
        items: { $concatArrays: ['$baseItems', '$bulkyItems'] }
      }
    },

    // Totals
    {
      $addFields: {
        total: { $add: ['$monthlyFee', { $ifNull: ['$bulkyTotal', 0] }] }
      }
    },
    {
      $addFields: {
        creditsApplied: {
          $cond: [
            APPLY_WALLET_CREDITS,
            { $min: ['$walletBalance', '$total'] },
            0
          ]
        }
      }
    },
    {
      $addFields: {
        amountDue: { $subtract: ['$total', '$creditsApplied'] }
      }
    },

    // Shape invoice
    {
      $project: {
        _id: 0,
        userId: '$citizenUserId',
        month: { $literal: TARGET_MONTH },
        status: { $literal: 'ISSUED' },
        items: 1,
        total: 1,
        creditsApplied: 1,
        amountDue: 1,
        generatedAt: '$$NOW',
        createdAt: '$$NOW',
        updatedAt: '$$NOW'
      }
    }
  ], { allowDiskUse: true })
  .toArray();

if (!invoices.length) {
  print('No households found to invoice.');
  quit(0);
}

// Idempotent upsert with $setOnInsert
const ops = invoices.map((inv) => ({
  updateOne: {
    filter: { userId: inv.userId, month: inv.month },
    update: { $setOnInsert: inv },
    upsert: true
  }
}));

const res = dbRef.invoices.bulkWrite(ops, { ordered: false });
print(`✅ Done. Inserted=${res.upsertedCount}, MatchedExisting=${res.matchedCount}`);
print('Note: MatchedExisting means invoice already existed for that user/month (no overwrite).');

if (APPLY_WALLET_CREDITS) {
  print('\n⚠️ Wallet credits were READ to compute creditsApplied, but NOT debited.');
  print('If you want to “consume” credits at invoice creation, ask me and I will provide the safe debit script.');
}

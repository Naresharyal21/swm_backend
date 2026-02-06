const dayjs = require('dayjs');
const ServiceCharge = require('../models/ServiceCharge');
const Household = require('../models/Household');
const BillingPlan = require('../models/BillingPlan');
const env = require('../config/env');

async function getBulkyChargeAmount({ householdId }) {
  if (!householdId) return env.billing.bulkyDailyCharge;
  const hh = await Household.findById(householdId).select('planId').lean();
  if (!hh?.planId) return env.billing.bulkyDailyCharge;
  const plan = await BillingPlan.findById(hh.planId).lean();
  if (!plan) return env.billing.bulkyDailyCharge;
  return Number(plan.bulkyDailyChargeOverride ?? env.billing.bulkyDailyCharge);
}

async function ensureBulkyChargeForTask({ userId, householdId, caseId, taskId, completedAt }) {
  const date = dayjs(completedAt || new Date()).format('YYYY-MM-DD');
  const amount = await getBulkyChargeAmount({ householdId });

  return ServiceCharge.findOneAndUpdate(
    { taskId },
    {
      $setOnInsert: {
        userId,
        householdId: householdId || null,
        caseId: caseId || null,
        taskId,
        date,
        kind: 'BULKY_DAILY',
        description: 'Bulky pickup service fee',
        amount,
        status: 'UNPAID',
        invoiceId: null,
        paidAt: null,
        paymentId: null
      }
    },
    { upsert: true, new: true }
  );
}

async function listServiceCharges({ userId, status }) {
  const q = { userId };
  if (status) q.status = status;
  return ServiceCharge.find(q).sort({ date: -1, createdAt: -1 }).limit(300).lean();
}

module.exports = { ensureBulkyChargeForTask, listServiceCharges };

const dayjs = require('dayjs');
const User = require('../models/User');
const Household = require('../models/Household');
const BillingPlan = require('../models/BillingPlan');
const Case = require('../models/Case');
const Task = require('../models/Task');
const Invoice = require('../models/Invoice');
const WalletTransaction = require('../models/WalletTransaction');
const env = require('../config/env');
const { ROLES, CASE_TYPES, TASK_STATUSES } = require('../config/constants');
const { getActiveMembership } = require('./membershipService');

async function getWalletBalance(userId) {
  const tx = await WalletTransaction.find({ userId }).lean();
  return tx.reduce((acc, t) => acc + (t.type === 'CREDIT' ? t.amount : -t.amount), 0);
}

async function generateMonthlyInvoices({ month }) {
  // month: 'YYYY-MM'
  const start = dayjs(`${month}-01`).startOf('month');
  const end = start.endOf('month');

  const households = await Household.find({ citizenUserId: { $ne: null } }).lean();
  const userIds = [...new Set(households.map(h => String(h.citizenUserId)))];

  const results = [];
  for (const userId of userIds) {
    const user = await User.findById(userId).lean();
    if (!user || user.role !== ROLES.CITIZEN) continue;

    const h = households.find(x => String(x.citizenUserId) === String(userId));
    let monthlyFee = 0;
    let billingMode = 'MONTHLY';
    let dailyPickupFee = 0;
    let bulkyDailyCharge = env.billing.bulkyDailyCharge;

    if (h?.planId) {
      const plan = await BillingPlan.findById(h.planId).lean();
      if (plan) {
        monthlyFee = plan.monthlyFee;
        billingMode = plan.billingMode || 'MONTHLY';
        dailyPickupFee = plan.dailyPickupFee || 0;
        bulkyDailyCharge = plan.bulkyDailyChargeOverride ?? bulkyDailyCharge;
      }
    }

    // Bulky completed tasks in this month
    const bulkyCases = await Case.find({ createdByUserId: userId, type: CASE_TYPES.BULKY }).select('_id').lean();
    const caseIds = bulkyCases.map(c => c._id);

    const bulkyTasks = caseIds.length
      ? await Task.find({
          caseId: { $in: caseIds },
          status: TASK_STATUSES.COMPLETED,
          proofEvidenceId: { $ne: null },
          completedAt: { $gte: start.toDate(), $lte: end.toDate() }
        }).lean()
      : [];

    const items = [];
    if (billingMode === 'MONTHLY' && monthlyFee > 0) {
      items.push({ date: start.format('YYYY-MM-DD'), kind: 'MONTHLY_FEE', description: 'Monthly waste service fee', amount: monthlyFee });
    }

    if (billingMode === 'DAILY_PICKUP' && dailyPickupFee > 0) {
      const dateFrom = start.format('YYYY-MM-DD');
      const dateTo = end.format('YYYY-MM-DD');
      const routineCases = await Case.find({ createdByUserId: userId, type: CASE_TYPES.ROUTINE_PICKUP, serviceDate: { $gte: dateFrom, $lte: dateTo } })
        .select('_id serviceDate')
        .lean();
      const routineIds = routineCases.map(c => c._id);
      const completed = routineIds.length
        ? await Task.find({ caseId: { $in: routineIds }, status: TASK_STATUSES.COMPLETED, completedAt: { $gte: start.toDate(), $lte: end.toDate() } })
            .select('caseId')
            .lean()
        : [];
      const completedSet = new Set(completed.map(t => String(t.caseId)));

      for (const c of routineCases) {
        if (!completedSet.has(String(c._id))) continue;
        items.push({ date: c.serviceDate, kind: 'DAILY_PICKUP', description: 'Daily pickup fee', amount: dailyPickupFee });
      }
    }

    for (const t of bulkyTasks) {
      const d = dayjs(t.completedAt).format('YYYY-MM-DD');
      items.push({ date: d, kind: 'BULKY_DAILY', description: 'Bulky pickup daily charge', amount: bulkyDailyCharge });
    }

    // ✅ Membership fee + discount (optional)
    const membership = await getActiveMembership(userId);
    if (membership?.plan) {
      const mp = membership.plan;
      if ((mp.monthlyFee ?? 0) > 0) {
        items.push({ date: start.format('YYYY-MM-DD'), kind: 'MEMBERSHIP_FEE', description: `Membership: ${mp.name}`, amount: Number(mp.monthlyFee || 0) });
      }

      const discountPct = Number(mp.discountPercent || 0);
      if (discountPct > 0) {
        const discountBase = items
          .filter(it => ['MONTHLY_FEE', 'DAILY_PICKUP'].includes(it.kind))
          .reduce((s, it) => s + Number(it.amount || 0), 0);
        if (discountBase > 0) {
          const discountAmount = (discountBase * discountPct) / 100;
          items.push({ date: start.format('YYYY-MM-DD'), kind: 'MEMBERSHIP_DISCOUNT', description: `Membership discount (${discountPct}%)`, amount: -Number(discountAmount.toFixed(2)) });
        }
      }
    }

    const total = Number(items.reduce((s, it) => s + Number(it.amount || 0), 0).toFixed(2));

    // Apply wallet credits
    let credits = await getWalletBalance(userId);
    let creditsApplied = Math.min(Math.max(0, credits), total);
    let amountDue = total - creditsApplied;

    const existing = await Invoice.findOne({ userId, month });
    if (existing) {
      // Skip if already issued/paid; else update
      continue;
    }

    const invoice = await Invoice.create({
      userId,
      month,
      status: 'ISSUED',
      items,
      total,
      creditsApplied,
      amountDue,
      generatedAt: new Date()
    });

    if (creditsApplied > 0) {
      await WalletTransaction.create({
        userId,
        type: 'DEBIT',
        amount: creditsApplied,
        reason: `Credits applied to invoice ${month}`,
        refType: 'Invoice',
        refId: invoice._id
      });
    }

    results.push({ userId, invoiceId: invoice._id, total, creditsApplied, amountDue });
  }

  return results;
}

module.exports = { generateMonthlyInvoices };

const Case = require('../models/Case');

/**
 * Simple SLA escalation:
 * - If a case is open, has slaDeadline, and deadline passed -> set priority=1 (highest)
 * - Keeps status as-is.
 */
async function escalateSla() {
  const now = new Date();
  const q = { isOpen: true, slaDeadline: { $ne: null, $lte: now } };
  const cases = await Case.find(q).select('_id priority').lean();
  if (!cases.length) return { escalated: 0 };

  const ids = cases.map(c => c._id);
  await Case.updateMany({ _id: { $in: ids }, priority: { $gt: 1 } }, { $set: { priority: 1 } });
  return { escalated: ids.length };
}

module.exports = { escalateSla };

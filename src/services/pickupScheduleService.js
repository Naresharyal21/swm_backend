const dayjs = require('dayjs');
const Household = require('../models/Household');
const Case = require('../models/Case');
const { CASE_TYPES, CASE_STATUSES } = require('../config/constants');
const { createTaskForCase } = require('./taskService');

const TOKENS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function weekdayToken(date) {
  const d = dayjs(date);
  return TOKENS[d.day()];
}

async function getNextPickupDateForHousehold(household, fromDate = new Date()) {
  const days = Array.isArray(household.pickupScheduleDays) && household.pickupScheduleDays.length
    ? household.pickupScheduleDays
    : ['MON', 'WED', 'FRI'];

  let cursor = dayjs(fromDate).startOf('day');
  for (let i = 0; i < 14; i++) {
    const token = weekdayToken(cursor);
    if (days.includes(token)) return cursor.format('YYYY-MM-DD');
    cursor = cursor.add(1, 'day');
  }
  return dayjs(fromDate).format('YYYY-MM-DD');
}

async function ensureRoutinePickupsForDate({ date }) {
  const token = weekdayToken(date);
  const households = await Household.find({ citizenUserId: { $ne: null }, pickupScheduleDays: token }).lean();

  let created = 0;
  for (const h of households) {
    try {
      const c = await Case.create({
        type: CASE_TYPES.ROUTINE_PICKUP,
        status: CASE_STATUSES.APPROVED,
        isOpen: true,
        createdByUserId: h.citizenUserId,
        householdId: h._id,
        zoneId: h.zoneId,
        location: h.location,
        description: 'Routine household disposal pickup',
        serviceDate: date,
        priority: 3
      });
      await createTaskForCase(c, { scheduledDate: date });
      created++;
    } catch (err) {
      // Duplicate key -> already exists for that household/date
      if (String(err?.code) === '11000') continue;
      throw err;
    }
  }

  return { date, token, householdsMatched: households.length, created };
}

module.exports = {
  weekdayToken,
  getNextPickupDateForHousehold,
  ensureRoutinePickupsForDate
};

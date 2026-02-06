const env = require('../config/env');
const axios = require('axios');
const VirtualBin = require('../models/VirtualBin');
const VirtualBinMember = require('../models/VirtualBinMember');
const BinTwinLatest = require('../models/BinTwinLatest');
const VirtualBinTwin = require('../models/VirtualBinTwin');
const Case = require('../models/Case');
const { CASE_TYPES, CASE_STATUSES } = require('../config/constants');
const { getOrCreateSystemUser } = require('./systemService');
const { createTaskForCase } = require('./taskService');

function computeRiskSync({ pctOver80, pctOver95, avgFill, offlinePct }) {
  const risk = pctOver95 * 60 + pctOver80 * 30 + (avgFill / 100) * 10 + offlinePct * 20;
  return Math.max(0, Math.min(100, Math.round(risk)));
}

async function getRiskScore({ binsCount, avgFill, maxFill, pctOver80, pctOver95, offlinePct }) {
  const fallback = computeRiskSync({ pctOver80, pctOver95, avgFill, offlinePct });
  const baseUrl = (env.ai.baseUrl || '').trim();
  if (!baseUrl) return fallback;

  try {
    const url = `${baseUrl.replace(/\/$/, '')}/vb/risk`;
    const resp = await axios.post(
      url,
      {
        binsCount,
        avgFill,
        maxFill,
        pctOver80,
        pctOver95,
        offlinePct
      },
      { timeout: 2000 }
    );

    const score = resp?.data?.riskScore;
    if (Number.isFinite(score)) {
      return Math.max(0, Math.min(100, Math.round(score)));
    }
  } catch (e) {
    // Fallback silently
  }

  return fallback;
}

async function aggregateVirtualBin(vb) {
  const members = await VirtualBinMember.find({ virtualBinId: vb._id }).lean();
  const binIds = members.map(m => m.binId);
  if (binIds.length === 0) {
    await VirtualBinTwin.updateOne(
      { virtualBinId: vb._id },
      {
        $set: {
          virtualBinId: vb._id,
          computedAt: new Date(),
          binsCount: 0,
          over80Count: 0,
          over95Count: 0,
          offlineCount: 0,
          avgFill: 0,
          maxFill: 0,
          pctOver80: 0,
          pctOver95: 0,
          offlinePct: 0,
          riskScore: 0
        }
      },
      { upsert: true }
    );
    return;
  }

  const latest = await BinTwinLatest.find({ binId: { $in: binIds } }).lean();
  const latestByBinId = new Map(latest.map(l => [String(l.binId), l]));

  let over80 = 0;
  let over95 = 0;
  let offline = 0;
  let sum = 0;
  let max = 0;

  // offline heuristic: lastSeen older than 2 hours
  const offlineCutoff = Date.now() - 2 * 60 * 60 * 1000;

  for (const id of binIds) {
    const l = latestByBinId.get(String(id));
    if (!l || !l.lastSeenAt || new Date(l.lastSeenAt).getTime() < offlineCutoff) {
      offline += 1;
      continue;
    }
    const f = Number(l.fillPercent || 0);
    sum += f;
    if (f > max) max = f;
    if (f >= 80) over80 += 1;
    if (f >= 95) over95 += 1;
  }

  const seenCount = binIds.length - offline;
  const avgFill = seenCount > 0 ? sum / seenCount : 0;

  const pctOver80 = binIds.length ? over80 / binIds.length : 0;
  const pctOver95 = binIds.length ? over95 / binIds.length : 0;
  const offlinePct = binIds.length ? offline / binIds.length : 0;

  const riskScore = await getRiskScore({
    binsCount: binIds.length,
    avgFill,
    maxFill: max,
    pctOver80,
    pctOver95,
    offlinePct
  });

  await VirtualBinTwin.updateOne(
    { virtualBinId: vb._id },
    {
      $set: {
        virtualBinId: vb._id,
        computedAt: new Date(),
        binsCount: binIds.length,
        over80Count: over80,
        over95Count: over95,
        offlineCount: offline,
        avgFill: Number(avgFill.toFixed(2)),
        maxFill: max,
        pctOver80: Number(pctOver80.toFixed(4)),
        pctOver95: Number(pctOver95.toFixed(4)),
        offlinePct: Number(offlinePct.toFixed(4)),
        riskScore
      }
    },
    { upsert: true }
  );

  // trigger rules
  const tOver80 = vb.thresholds?.over80 ?? env.dt.over80Threshold;
  const tOver95 = vb.thresholds?.over95 ?? env.dt.over95Threshold;
  const tRisk = vb.thresholds?.risk ?? env.dt.riskThreshold;

  const shouldTrigger = pctOver80 >= tOver80 || pctOver95 >= tOver95 || riskScore >= tRisk;
  if (!shouldTrigger) return;

  // ensure only one open BIN_SERVICE case per VB (unique index enforces)
  const systemUser = await getOrCreateSystemUser();
  try {
    const c = await Case.create({
      type: CASE_TYPES.BIN_SERVICE,
      status: CASE_STATUSES.VALIDATED,
      isOpen: true,
      createdByUserId: systemUser._id,
      virtualBinId: vb._id,
      zoneId: vb.zoneId,
      location: vb.centroid,
      description: `Auto-triggered from DT: risk=${riskScore} over80=${pctOver80.toFixed(2)} over95=${pctOver95.toFixed(2)} offline=${offlinePct.toFixed(2)}`,
      priority: 1,
      slaDeadline: new Date(Date.now() + 2 * 60 * 60 * 1000),
      validation: { validatedByUserId: systemUser._id, validatedAt: new Date(), note: 'Auto-validated by Digital Twin trigger' }
    });

    await createTaskForCase({ caseId: c._id, createdByUserId: systemUser._id });
  } catch (e) {
    // duplicate open case for same VB -> ignore
  }
}

async function aggregateAll() {
  const vbs = await VirtualBin.find({ isActive: true }).lean();
  for (const vb of vbs) {
    await aggregateVirtualBin(vb);
  }
}

module.exports = { aggregateAll, aggregateVirtualBin };

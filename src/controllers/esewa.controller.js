// src/controllers/esewa.controller.js
const axios = require("axios");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const env = require("../config/env");

const BillingPlan = require("../models/BillingPlan");
const PaymentTransaction = require("../models/PaymentTransaction");
const Subscription = require("../models/Subscription");

// -------------------------
// date helpers (UTC-safe)
// -------------------------
function monthStartUTC(year, month1to12) {
  return new Date(Date.UTC(year, month1to12 - 1, 1, 0, 0, 0, 0));
}
function monthEndExclusiveUTC(year, month1to12) {
  return new Date(Date.UTC(year, month1to12, 1, 0, 0, 0, 0));
}
function yearStartUTC(year) {
  return new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
}
function yearEndExclusiveUTC(year) {
  return new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0));
}
function addMonths(date, months = 1) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
function isValidDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}
function toInt(v) {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

// v2 request signature: order must match signed_field_names exactly
function signEsewaRequest({ total_amount, transaction_uuid, product_code }) {
  const message = `total_amount=${total_amount},transaction_uuid=${transaction_uuid},product_code=${product_code}`;
  return crypto.createHmac("sha256", env.esewa.secretKey).update(message).digest("base64");
}

async function esewaStatusCheck({ product_code, total_amount, transaction_uuid }) {
  const r = await axios.get(env.esewa.statusUrl, {
    params: { product_code, total_amount, transaction_uuid },
    timeout: 15000,
  });
  return r.data; // { status, ref_id, ... }
}

function normalizeKind(kind, fallbackMode) {
  const k = String(kind || fallbackMode || "MONTHLY").toUpperCase().trim();
  if (["MONTHLY", "ANNUAL", "DAILY", "BULKY"].includes(k)) return k;
  return "MONTHLY";
}

// ✅ choose amount from plan by kind
function resolveAmountFromPlan(plan, kind) {
  const k = normalizeKind(kind, plan.billingMode);

  if (k === "MONTHLY") return { kind: "MONTHLY", amount: Number(plan.monthlyFee || 0) };
  if (k === "ANNUAL") return { kind: "ANNUAL", amount: Number(plan.annualFee || 0) };
  if (k === "DAILY") return { kind: "DAILY", amount: Number(plan.dailyPickupFee || 0) };

  if (k === "BULKY") {
    const override = plan.bulkyDailyChargeOverride;
    const fallback = Number(env.billing?.bulkyDailyCharge || 0);
    const amount = override == null ? fallback : Number(override || 0);
    return { kind: "BULKY", amount };
  }

  return { kind: k, amount: NaN };
}

// -------------------------
// ✅ BLOCKING RULE:
// ONLY block when status === "COMPLETE"
// INITIATED should NEVER block.
// -------------------------

async function hasExactMonthlyPaid({ userId, year, month }) {
  const hit = await PaymentTransaction.findOne({
    userId,
    provider: "ESEWA",
    status: "COMPLETE", // ✅ ONLY COMPLETE blocks
    kind: "MONTHLY",
    targetYear: year,
    targetMonth: month,
  })
    .select("_id")
    .lean();
  return !!hit;
}

async function hasExactAnnualPaid({ userId, year }) {
  const hit = await PaymentTransaction.findOne({
    userId,
    provider: "ESEWA",
    status: "COMPLETE", // ✅ ONLY COMPLETE blocks
    kind: "ANNUAL",
    targetYear: year,
  })
    .select("_id")
    .lean();
  return !!hit;
}

// overlap: existing covers any part of [coverFrom, coverTo)
async function hasCoverageOverlap({ userId, coverFrom, coverTo }) {
  if (!coverFrom || !coverTo) return false;

  const hit = await PaymentTransaction.findOne({
    userId,
    provider: "ESEWA",
    status: "COMPLETE", // ✅ ONLY COMPLETE blocks
    kind: { $in: ["MONTHLY", "ANNUAL"] },
    coverFrom: { $ne: null },
    coverTo: { $ne: null },
    $and: [{ coverFrom: { $lt: coverTo } }, { coverTo: { $gt: coverFrom } }],
  })
    .select("_id kind coverFrom coverTo")
    .lean();

  return !!hit;
}

/**
 * POST /api/payments/esewa/initiate
 * body:
 *  {
 *    planId,
 *    kind: MONTHLY | ANNUAL | DAILY | BULKY,
 *    targetYear? (or year),
 *    targetMonth? (or month)  // MONTHLY only
 *  }
 */
async function initiateEsewa(req, res) {
  try {
    const userId = req.user && (req.user._id || req.user.id);
    const { planId } = req.body || {};
    const kindInput = req.body?.kind;

    const now = new Date();
    const targetYearRaw = req.body?.targetYear ?? req.body?.year ?? now.getFullYear();
    const targetMonthRaw = req.body?.targetMonth ?? req.body?.month ?? now.getMonth() + 1;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!planId) return res.status(400).json({ message: "planId is required" });

    const plan = await BillingPlan.findById(planId).lean();
    if (!plan || plan.isActive === false) return res.status(400).json({ message: "Invalid plan" });

    const kind = normalizeKind(kindInput, plan.billingMode);

    // ✅ compute target + cover range for MONTHLY/ANNUAL
    let targetYear = null;
    let targetMonth = null;
    let coverFrom = null;
    let coverTo = null;

    if (kind === "MONTHLY") {
      const y = toInt(targetYearRaw);
      const m = toInt(targetMonthRaw);

      if (!y) return res.status(400).json({ message: "MONTHLY requires targetYear (int)" });
      if (!m || m < 1 || m > 12) return res.status(400).json({ message: "MONTHLY requires targetMonth 1..12" });

      targetYear = y;
      targetMonth = m;
      coverFrom = monthStartUTC(y, m);
      coverTo = monthEndExclusiveUTC(y, m);

      // ✅ block exact duplicate month (ONLY COMPLETE blocks)
      if (await hasExactMonthlyPaid({ userId, year: y, month: m })) {
        return res.status(400).json({ message: "Already paid for this month" });
      }

      // ✅ block if annual already covers (ONLY COMPLETE blocks)
      if (await hasCoverageOverlap({ userId, coverFrom, coverTo })) {
        return res.status(400).json({ message: "Already paid (covered) for this month" });
      }
    }

    if (kind === "ANNUAL") {
      const y = toInt(targetYearRaw);
      if (!y) return res.status(400).json({ message: "ANNUAL requires targetYear (int)" });

      targetYear = y;
      coverFrom = yearStartUTC(y);
      coverTo = yearEndExclusiveUTC(y);

      // ✅ block exact duplicate year (ONLY COMPLETE blocks)
      if (await hasExactAnnualPaid({ userId, year: y })) {
        return res.status(400).json({ message: "Already paid for this year" });
      }

      // ✅ block if overlaps any existing monthly/annual (ONLY COMPLETE blocks)
      if (await hasCoverageOverlap({ userId, coverFrom, coverTo })) {
        return res.status(400).json({ message: "Already paid (covered) for this year" });
      }
    }

    // DAILY/BULKY: no blocking

    const resolved = resolveAmountFromPlan(plan, kind);
    const amount = Number(resolved.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        message: `Invalid amount for kind=${resolved.kind}. Check plan fees.`,
      });
    }

    const txUuid = uuidv4();

    // ✅ Use 1 decimal to match eSewa "200.0"
    const total_amount = Number(amount).toFixed(1);
    const signed_field_names = "total_amount,transaction_uuid,product_code";
    const product_code = env.esewa.productCode;

    const signature = signEsewaRequest({
      total_amount: String(total_amount),
      transaction_uuid: txUuid,
      product_code,
    });

    await PaymentTransaction.create({
      userId,
      planId,
      kind: resolved.kind,
      provider: "ESEWA",
      transactionUuid: txUuid,

      // ✅ store targeting + coverage (critical for your calendar)
      targetYear,
      targetMonth,
      coverFrom,
      coverTo,

      amount: Number(total_amount),
      currency: "NPR",
      productCode: product_code,

      // ✅ INITIATED is allowed and MUST NOT block (guards use only COMPLETE)
      status: "INITIATED",
    });

    return res.json({
      formUrl: env.esewa.formUrl,
      fields: {
        amount: String(total_amount),
        tax_amount: "0",
        total_amount: String(total_amount),
        transaction_uuid: txUuid,
        product_code,
        product_service_charge: "0",
        product_delivery_charge: "0",
        success_url: `${env.apiPublicUrl}/api/payments/esewa/success`,
        failure_url: `${env.apiPublicUrl}/api/payments/esewa/failure`,
        signed_field_names,
        signature,
      },
    });
  } catch (e) {
    return res.status(500).json({ message: e?.message || "Failed to initiate eSewa" });
  }
}

/**
 * GET /api/payments/esewa/status/:txUuid   (auth)
 */
async function esewaStatus(req, res) {
  try {
    const userId = req.user && (req.user._id || req.user.id);
    const txUuid = req.params.txUuid;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!txUuid) return res.status(400).json({ message: "txUuid is required" });

    const tx = await PaymentTransaction.findOne({
      provider: "ESEWA",
      transactionUuid: txUuid,
      userId,
    }).lean();

    if (!tx) return res.status(404).json({ message: "Transaction not found" });

    const total_amount = Number(tx.amount).toFixed(1);

    const status = await esewaStatusCheck({
      product_code: tx.productCode || env.esewa.productCode,
      total_amount,
      transaction_uuid: tx.transactionUuid,
    });

    return res.json({ tx, status });
  } catch (e) {
    return res.status(500).json({ message: e?.message || "Status check failed" });
  }
}

/**
 * GET/POST /api/payments/esewa/success
 *
 * IMPORTANT:
 * - You said your system uses only INITIATED and COMPLETE.
 * - So we update to COMPLETE only when eSewa status is COMPLETE.
 * - Otherwise we keep INITIATED (do not set PENDING etc.).
 *
 * Also:
 * - If old INITIATED records exist with null targetYear/targetMonth/coverFrom/coverTo,
 *   we backfill them on COMPLETE (so calendar works).
 */
async function esewaSuccess(req, res) {
  try {
    const incoming = { ...(req.query || {}), ...(req.body || {}) };

    let payload = null;

    // A) data=BASE64(JSON)
    if (incoming.data) {
      try {
        const decoded = Buffer.from(String(incoming.data), "base64").toString("utf8");
        payload = JSON.parse(decoded);
      } catch {
        payload = null;
      }
    }

    // B) fallback: plain fields
    if (!payload) payload = incoming;

    const transaction_uuid = payload?.transaction_uuid;
    if (!transaction_uuid) return res.redirect(`${env.websiteUrl}/billing/failed`);

    const tx = await PaymentTransaction.findOne({
      provider: "ESEWA",
      transactionUuid: transaction_uuid,
    });

    if (!tx) return res.redirect(`${env.websiteUrl}/billing/failed`);

    // ✅ DB is source of truth (amount/product_code)
    const total_amount = Number(tx.amount).toFixed(1);
    const product_code = tx.productCode || env.esewa.productCode;

    let statusRaw = null;
    let refId = payload?.transaction_code || null;

    try {
      const statusResp = await esewaStatusCheck({
        product_code,
        total_amount,
        transaction_uuid: tx.transactionUuid,
      });
      statusRaw = statusResp?.status || null;
      refId = statusResp?.ref_id || refId;
    } catch {
      statusRaw = payload?.status || null;
    }

    const status = String(statusRaw || "").trim().toUpperCase();
    const isComplete = status === "COMPLETE";

    // ✅ only INITIATED / COMPLETE
    tx.status = isComplete ? "COMPLETE" : "INITIATED";
    tx.providerRefId = refId;
    tx.rawPayload = payload;

    // ✅ Backfill targeting/coverage on COMPLETE if missing (fixes your old null targetYear/targetMonth)
    if (isComplete) {
      const k = String(tx.kind || "MONTHLY").toUpperCase();
      const base = isValidDate(tx.createdAt) ? tx.createdAt : new Date();

      // If missing annual/monthly coverage, infer from createdAt (fallback)
      if (k === "MONTHLY") {
        if (!Number.isInteger(tx.targetYear) || !Number.isInteger(tx.targetMonth)) {
          const y = base.getUTCFullYear();
          const m = base.getUTCMonth() + 1;
          tx.targetYear = y;
          tx.targetMonth = m;
        }
        if (!isValidDate(tx.coverFrom) || !isValidDate(tx.coverTo)) {
          tx.coverFrom = monthStartUTC(tx.targetYear, tx.targetMonth);
          tx.coverTo = monthEndExclusiveUTC(tx.targetYear, tx.targetMonth);
        }
      }

      if (k === "ANNUAL") {
        if (!Number.isInteger(tx.targetYear)) {
          tx.targetYear = base.getUTCFullYear();
        }
        if (!isValidDate(tx.coverFrom) || !isValidDate(tx.coverTo)) {
          tx.coverFrom = yearStartUTC(tx.targetYear);
          tx.coverTo = yearEndExclusiveUTC(tx.targetYear);
        }
      }
    }

    await tx.save();

    // ✅ If COMPLETE, update subscription based on kind
    if (isComplete) {
      try {
        const k = String(tx.kind || "MONTHLY").toUpperCase();
        const now = new Date();

        // prefer coverFrom/coverTo if available
        const validFrom = isValidDate(tx.coverFrom) ? tx.coverFrom : now;

        let validUntil = null;
        if (isValidDate(tx.coverTo)) validUntil = tx.coverTo;
        else if (k === "ANNUAL") validUntil = addMonths(validFrom, 12);
        else if (k === "MONTHLY") validUntil = addMonths(validFrom, 1);
        else validUntil = addMonths(now, 1);

        // ✅ Only MONTHLY/ANNUAL should activate subscription.
        if (k === "MONTHLY" || k === "ANNUAL") {
          await Subscription.findOneAndUpdate(
            { userId: tx.userId },
            {
              userId: tx.userId,
              planId: tx.planId,
              status: "ACTIVE",
              validFrom,
              validUntil,
              lastPaymentTxId: tx._id,
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        }
      } catch (err) {
        console.error("Subscription upsert failed:", err?.message || err);
      }

      return res.redirect(`${env.websiteUrl}/billing/success`);
    }

    // Not COMPLETE => still INITIATED
    return res.redirect(`${env.websiteUrl}/billing/pending`);
  } catch (e) {
    console.error("ESEWA SUCCESS ERROR:", e?.message || e);
    return res.redirect(`${env.websiteUrl}/billing/failed`);
  }
}

/**
 * GET/POST /api/payments/esewa/failure
 */
async function esewaFailure(req, res) {
  return res.redirect(`${env.websiteUrl}/billing/failed`);
}

module.exports = {
  initiateEsewa,
  esewaStatus,
  esewaSuccess,
  esewaFailure,
};

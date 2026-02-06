const axios = require("axios");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const env = require("../config/env");

const BillingPlan = require("../models/BillingPlan");
const PaymentTransaction = require("../models/PaymentTransaction");
const Subscription = require("../models/Subscription");

function addMonth(date, months = 1) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// v2 request signature: order must match signed_field_names exactly
function signEsewaRequest({ total_amount, transaction_uuid, product_code }) {
  const message = `total_amount=${total_amount},transaction_uuid=${transaction_uuid},product_code=${product_code}`;
  return crypto.createHmac("sha256", env.esewa.secretKey).update(message).digest("base64");
}

async function esewaStatusCheck({ product_code, total_amount, transaction_uuid }) {
  const r = await axios.get(env.esewa.statusUrl, {
    params: { product_code, total_amount, transaction_uuid },
    timeout: 15000
  });
  return r.data; // { status, ref_id, ... }
}

/**
 * POST /api/payments/esewa/initiate
 * body: { planId }
 */
async function initiateEsewa(req, res) {
  try {
    const userId = req.user && (req.user._id || req.user.id);
    const { planId } = req.body || {};

    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!planId) return res.status(400).json({ message: "planId is required" });

    const plan = await BillingPlan.findById(planId).lean();
    if (!plan || plan.isActive === false) return res.status(400).json({ message: "Invalid plan" });

    const amount = Number(plan.monthlyFee);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: "Plan monthlyFee invalid" });

    const txUuid = uuidv4();

    // ✅ keep 1 decimal because eSewa often uses "200.0"
    const total_amount = Number(amount).toFixed(1);
    const signed_field_names = "total_amount,transaction_uuid,product_code";

    const signature = signEsewaRequest({
      total_amount: String(total_amount),
      transaction_uuid: txUuid,
      product_code: env.esewa.productCode
    });

    await PaymentTransaction.create({
      userId,
      planId,
      provider: "ESEWA",
      transactionUuid: txUuid,
      amount: Number(total_amount),
      currency: "NPR",
      productCode: env.esewa.productCode,
      status: "INITIATED"
    });

    return res.json({
      formUrl: env.esewa.formUrl,
      fields: {
        amount: String(total_amount),
        tax_amount: "0",
        total_amount: String(total_amount),
        transaction_uuid: txUuid,
        product_code: env.esewa.productCode,
        product_service_charge: "0",
        product_delivery_charge: "0",
        success_url: `${env.apiPublicUrl}/api/payments/esewa/success`,
        failure_url: `${env.apiPublicUrl}/api/payments/esewa/failure`,
        signed_field_names,
        signature
      }
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
      userId
    }).lean();

    if (!tx) return res.status(404).json({ message: "Transaction not found" });

    const total_amount = Number(tx.amount).toFixed(1);

    const status = await esewaStatusCheck({
      product_code: tx.productCode || env.esewa.productCode,
      total_amount,
      transaction_uuid: tx.transactionUuid
    });

    return res.json({ tx, status });
  } catch (e) {
    return res.status(500).json({ message: e?.message || "Status check failed" });
  }
}

/**
 * GET/POST /api/payments/esewa/success
 * Accepts either:
 *  - data=BASE64(JSON) (query or body)
 *  - plain fields (query or body)
 */
// console.log("ESEWA CALLBACK METHOD:", req.method, "incoming:", { ...req.query, ...req.body });

async function esewaSuccess(req, res) {
  try {
    // ✅ merge both sources (POST form lands in body, GET lands in query)
    const incoming = { ...(req.query || {}), ...(req.body || {}) };

    let payload = null;

    // A) data=BASE64(JSON) (may come in query OR body)
    if (incoming.data) {
      try {
        const decoded = Buffer.from(String(incoming.data), "base64").toString("utf8");
        payload = JSON.parse(decoded);
      } catch {
        payload = null;
      }
    }

    // B) fallback to plain fields
    if (!payload) payload = incoming;

    const transaction_uuid = payload?.transaction_uuid;
    if (!transaction_uuid) return res.redirect(`${env.websiteUrl}/billing/failed`);

    const tx = await PaymentTransaction.findOne({
      provider: "ESEWA",
      transactionUuid: transaction_uuid
    });

    if (!tx) return res.redirect(`${env.websiteUrl}/billing/failed`);

    // Use DB as source of truth for amount + product code
    const total_amount = Number(tx.amount).toFixed(1);
    const product_code = tx.productCode || env.esewa.productCode;

    // Verify with status API; if API fails, fallback to payload.status
    let statusRaw = null;
    let refId = payload?.transaction_code || null;

    try {
      const statusResp = await esewaStatusCheck({
        product_code,
        total_amount,
        transaction_uuid: tx.transactionUuid
      });
      statusRaw = statusResp?.status || null;
      refId = statusResp?.ref_id || refId;
    } catch {
      statusRaw = payload?.status || null;
    }

    const status = String(statusRaw || "").trim().toUpperCase();

    // Save tx always
    tx.status = status || tx.status || "PENDING";
    tx.providerRefId = refId;
    tx.rawPayload = payload;
    await tx.save();

    // ✅ If COMPLETE, never redirect failed (even if subscription upsert fails)
    if (status === "COMPLETE") {
      try {
        const now = new Date();
        await Subscription.findOneAndUpdate(
          { userId: tx.userId },
          {
            userId: tx.userId,
            planId: tx.planId,
            status: "ACTIVE",
            validFrom: now,
            validUntil: addMonth(now, 1),
            lastPaymentTxId: tx._id
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } catch (err) {
        console.error("Subscription upsert failed:", err?.message || err);
      }

      return res.redirect(`${env.websiteUrl}/billing/success`);
    }

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
  esewaFailure
};

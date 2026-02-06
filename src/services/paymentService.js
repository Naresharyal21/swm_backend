const axios = require("axios");
const crypto = require("crypto");
const env = require("../config/env");

const PaymentIntent = require("../models/PaymentIntent");
const Invoice = require("../models/Invoice");
const WalletTransaction = require("../models/WalletTransaction");

// ----------------------------
// eSewa helpers (ePay v2)
// ----------------------------
function signEsewaRequest({ total_amount, transaction_uuid, product_code }) {
  const message = `total_amount=${total_amount},transaction_uuid=${transaction_uuid},product_code=${product_code}`;
  return crypto
    .createHmac("sha256", env.esewa.secretKey)
    .update(message)
    .digest("base64");
}

async function esewaStatusCheck({ product_code, total_amount, transaction_uuid }) {
  const r = await axios.get(env.esewa.statusUrl, {
    params: { product_code, total_amount, transaction_uuid },
    timeout: 15000,
  });
  return r.data; // { status, ref_id, ... }
}

/**
 * Create Payment Intent
 * provider: ESEWA | MOCK
 */
async function createPaymentIntent({ userId, invoiceId, provider }) {
  const invoice = await Invoice.findOne({ _id: invoiceId, userId }).lean();
  if (!invoice) throw new Error("Invoice not found");

  const amountDue = Number(invoice.amountDue || 0);
  if (amountDue <= 0) throw new Error("Nothing to pay");

  const normalizedProvider = String(provider || env.payments.provider || "MOCK").toUpperCase();

  const intent = await PaymentIntent.create({
    userId,
    invoiceId,
    provider: normalizedProvider,
    amount: amountDue,
    status: "CREATED",
  });

  // ----------------------------
  // MOCK
  // ----------------------------
  if (normalizedProvider === "MOCK") {
    const paymentUrl = `${env.payments.mockBaseUrl}/mock/payments/${intent._id}`;
    await PaymentIntent.updateOne(
      { _id: intent._id },
      { $set: { status: "INITIATED", paymentUrl } }
    );
    return await PaymentIntent.findById(intent._id).lean();
  }

  // ----------------------------
  // ESEWA (web form redirect)
  // ----------------------------
  if (normalizedProvider === "ESEWA") {
    // eSewa typically expects amount formatting; keep 2 decimal safe
    const amount = Number(amountDue.toFixed(2));
    const total_amount = amount;

    // Use PaymentIntent ID as transaction UUID (stable + unique)
    const transaction_uuid = String(intent._id);

    const signed_field_names = "total_amount,transaction_uuid,product_code";

    const signature = signEsewaRequest({
      total_amount: String(total_amount),
      transaction_uuid,
      product_code: env.esewa.productCode,
    });

    // Your backend callback endpoints
    const success_url = `${env.apiPublicUrl}/api/payments/esewa/callback/success`;
    const failure_url = `${env.apiPublicUrl}/api/payments/esewa/callback/failure`;

    // Store fields so frontend can render the form
    const paymentMeta = {
      formUrl: env.esewa.formUrl,
      fields: {
        amount: String(amount),
        tax_amount: "0",
        total_amount: String(total_amount),
        transaction_uuid,
        product_code: env.esewa.productCode,
        product_service_charge: "0",
        product_delivery_charge: "0",
        success_url,
        failure_url,
        signed_field_names,
        signature,
      },
    };

    // Optional "paymentUrl": you can set to your frontend page that auto-submits form
    const paymentUrl = `${env.websiteUrl}/billing/esewa?intentId=${intent._id}`;

    await PaymentIntent.updateOne(
      { _id: intent._id },
      {
        $set: {
          status: "INITIATED",
          providerPayload: paymentMeta,
          providerReference: transaction_uuid,
          paymentUrl,
        },
      }
    );

    return await PaymentIntent.findById(intent._id).lean();
  }

  throw new Error("Unsupported payment provider");
}

/**
 * eSewa callback handler (server-side verification)
 * Call this from a controller that receives:
 *  - req.query.data (base64 json)
 */
async function handleEsewaCallback(dataB64) {
  if (!dataB64) throw new Error("Missing data");

  const decoded = Buffer.from(String(dataB64), "base64").toString("utf8");
  const payload = JSON.parse(decoded);

  const transaction_uuid = payload.transaction_uuid; // we used PaymentIntent ID
  const total_amount = Number(payload.total_amount);
  const product_code = payload.product_code;

  if (!transaction_uuid) throw new Error("Missing transaction_uuid");

  const intent = await PaymentIntent.findById(transaction_uuid);
  if (!intent) throw new Error("PaymentIntent not found");

  // Strong verification with status endpoint
  const statusResp = await esewaStatusCheck({
    product_code,
    total_amount,
    transaction_uuid,
  });

  const status = statusResp?.status; // COMPLETE / PENDING / etc
  const ref_id = statusResp?.ref_id;

  await PaymentIntent.updateOne(
    { _id: intent._id },
    {
      $set: {
        status: status === "COMPLETE" ? "PAID" : status === "PENDING" ? "PENDING" : "FAILED",
        providerPayload: payload,
        providerReference: ref_id || intent.providerReference,
      },
    }
  );

  if (status !== "COMPLETE") {
    return { success: false, status: status || "UNKNOWN" };
  }

  // Wallet debit
  await WalletTransaction.create({
    userId: intent.userId,
    type: "DEBIT",
    amount: Number(intent.amount),
    reason: "INVOICE_PAYMENT",
    refType: "PaymentIntent",
    refId: intent._id,
  });

  // Mark invoice paid
  await Invoice.updateOne({ _id: intent.invoiceId }, { $set: { status: "PAID" } });

  return { success: true, refId: ref_id || null };
}

module.exports = {
  createPaymentIntent,
  handleEsewaCallback,
};

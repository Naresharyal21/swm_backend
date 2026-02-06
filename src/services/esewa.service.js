const crypto = require("crypto");
const axios = require("axios");
const env = require("../config/env");

function esewaConfig() {
  if (!env.esewa) {
    throw new Error("Missing env.esewa config. Check src/config/env.js and .env ESEWA_* variables.");
  }
  return {
    productCode: env.esewa.productCode,
    secretKey: env.esewa.secretKey,
    formUrl: env.esewa.formUrl,
    statusUrl: env.esewa.statusUrl,
  };
}

// Request signature (v2) for signed_field_names: total_amount,transaction_uuid,product_code
function signRequest({ total_amount, transaction_uuid, product_code }) {
  const { secretKey } = esewaConfig();
  const message = `total_amount=${total_amount},transaction_uuid=${transaction_uuid},product_code=${product_code}`;
  return crypto.createHmac("sha256", secretKey).update(message).digest("base64");
}

// Response signature verification (uses payload.signed_field_names order)
function verifyResponseSignature(payload) {
  const { secretKey } = esewaConfig();
  const names = String(payload?.signed_field_names || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!names.length) return false;

  const message = names.map((k) => `${k}=${payload[k]}`).join(",");
  const expected = crypto.createHmac("sha256", secretKey).update(message).digest("base64");
  return expected === payload.signature;
}

async function checkStatus({ product_code, total_amount, transaction_uuid }) {
  const { statusUrl } = esewaConfig();
  const r = await axios.get(statusUrl, {
    params: { product_code, total_amount, transaction_uuid },
    timeout: 15000,
  });
  return r.data; // { status, ref_id, ... }
}

module.exports = {
  esewaConfig,
  signRequest,
  verifyResponseSignature,
  checkStatus,
};

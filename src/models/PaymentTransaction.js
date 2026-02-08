// src/models/PaymentTransaction.js
const mongoose = require("mongoose");

const PaymentTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillingPlan",
      required: true,
    },

    provider: { type: String, enum: ["ESEWA", "MOCK"], required: true },
    transactionUuid: { type: String, required: true, unique: true, index: true },

    // ✅ NEW: what type of payment this is
    kind: {
      type: String,
      enum: ["MONTHLY", "ANNUAL", "DAILY", "BULKY"],
      default: "MONTHLY",
      index: true,
    },

    // ✅ NEW: Coverage window (ONLY for MONTHLY/ANNUAL; null for DAILY/BULKY)
    // Used to block paying same month twice and block Monthly when Annual covers that month
    coverFrom: { type: Date, default: null, index: true },
    coverTo: { type: Date, default: null, index: true },

    // ✅ NEW: Explicit month/year targeting for monthly payments (Optional but useful for UI/calendar)
    // month: 1-12
    targetYear: { type: Number, default: null, index: true },
    targetMonth: { type: Number, default: null, index: true },

    amount: { type: Number, required: true },
    currency: { type: String, default: "NPR" },

    productCode: { type: String },
    status: {
      type: String,
      enum: ["INITIATED", "COMPLETE", "PENDING", "FAILED", "CANCELED", "NOT_FOUND", "AMBIGUOUS"],
      default: "INITIATED",
      index: true,
    },

    providerRefId: { type: String },
    rawPayload: { type: Object },
  },
  { timestamps: true }
);

/**
 * Indexes to support:
 * - coverage overlap checks for MONTHLY/ANNUAL
 * - fast "paid months in a year" queries
 */

// For overlap checks: find "paid/complete" tx that overlaps new coverFrom/coverTo
PaymentTransactionSchema.index(
  { userId: 1, provider: 1, status: 1, coverFrom: 1, coverTo: 1, kind: 1 },
  { name: "tx_coverage_lookup" }
);

// For quick month lookup in calendar UI
PaymentTransactionSchema.index(
  { userId: 1, kind: 1, targetYear: 1, targetMonth: 1, status: 1 },
  { name: "tx_month_lookup" }
);

module.exports = mongoose.model("PaymentTransaction", PaymentTransactionSchema);

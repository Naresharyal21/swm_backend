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

    // ✅ OPTION A: tie the payment to ONE household (one bin activation)
    householdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Household",
      default: null,
      index: true,
    },

    // ✅ OPTIONAL: if you want direct link to Bin document (mongo _id)
    // (not the binId string like BIN-001)
    binMongoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bin",
      default: null,
      index: true,
    },

    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillingPlan",
      required: true,
      index: true,
    },

    provider: { type: String, enum: ["ESEWA", "MOCK"], required: true },
    transactionUuid: { type: String, required: true, unique: true, index: true },

    // ✅ what type of payment this is
    kind: {
      type: String,
      enum: ["MONTHLY", "ANNUAL", "DAILY", "BULKY"],
      default: "MONTHLY",
      index: true,
    },

    /**
     * ✅ Coverage window (MONTHLY/ANNUAL only)
     * Use this for:
     * - calendar (covers months)
     * - overlap checks
     */
    coverFrom: { type: Date, default: null, index: true },
    coverTo: { type: Date, default: null, index: true },

    /**
     * ✅ Explicit month/year (MONTHLY UI)
     * month: 1-12
     */
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
 * ✅ OPTION A: Uniqueness rules (per household)
 *
 * MONTHLY:
 *   one tx per (userId, householdId, kind=MONTHLY, targetYear, targetMonth)
 *
 * ANNUAL:
 *   one tx per (userId, householdId, kind=ANNUAL, targetYear)
 *
 * NOTE:
 * - These indexes require householdId for MONTHLY/ANNUAL.
 * - DAILY/BULKY are not restricted by these unique indexes.
 */

// ✅ MONTHLY unique per household per month
PaymentTransactionSchema.index(
  { userId: 1, householdId: 1, kind: 1, targetYear: 1, targetMonth: 1 },
  {
    unique: true,
    name: "uniq_monthly_per_household",
    partialFilterExpression: {
      kind: "MONTHLY",
      householdId: { $type: "objectId" },
      targetYear: { $type: "number" },
      targetMonth: { $type: "number" },
    },
  }
);

// ✅ ANNUAL unique per household per year
PaymentTransactionSchema.index(
  { userId: 1, householdId: 1, kind: 1, targetYear: 1 },
  {
    unique: true,
    name: "uniq_annual_per_household_year",
    partialFilterExpression: {
      kind: "ANNUAL",
      householdId: { $type: "objectId" },
      targetYear: { $type: "number" },
    },
  }
);

/**
 * ✅ Coverage lookup (scoped per household now)
 * Used to find "paid/complete" tx that overlaps coverFrom/coverTo
 */
PaymentTransactionSchema.index(
  { userId: 1, householdId: 1, provider: 1, status: 1, coverFrom: 1, coverTo: 1, kind: 1 },
  { name: "tx_coverage_lookup" }
);

/**
 * ✅ Month lookup for UI (scoped per household now)
 */
PaymentTransactionSchema.index(
  { userId: 1, householdId: 1, kind: 1, targetYear: 1, targetMonth: 1, status: 1 },
  { name: "tx_month_lookup" }
);

module.exports = mongoose.model("PaymentTransaction", PaymentTransactionSchema);

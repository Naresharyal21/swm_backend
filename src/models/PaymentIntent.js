// src/models/PaymentIntent.js
const mongoose = require("mongoose");

const PaymentIntentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ✅ If your flow is invoice-based, keep invoiceId.
    // If later you want "direct plan pay", you can allow invoiceId=null.
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
      index: true,
    },

    // ✅ OPTION A: which household/bin this payment is for
    householdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Household",
      default: null,
      index: true,
    },

    // ✅ optional: direct link to Bin document (_id)
    binMongoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bin",
      default: null,
      index: true,
    },

    // ✅ Payment provider
    provider: {
      type: String,
      enum: ["MOCK", "KHALTI"],
      required: true,
      index: true,
    },

    // ✅ Mirrors PaymentTransaction.kind
    kind: {
      type: String,
      enum: ["MONTHLY", "ANNUAL", "DAILY", "BULKY"],
      default: "MONTHLY",
      index: true,
    },

    // ✅ Plan paid for (recommended to store here too, even if invoice exists)
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillingPlan",
      default: null,
      index: true,
    },

    // ✅ Coverage + target month/year (for MONTHLY/ANNUAL)
    coverFrom: { type: Date, default: null, index: true },
    coverTo: { type: Date, default: null, index: true },
    targetYear: { type: Number, default: null, index: true },
    targetMonth: { type: Number, default: null, index: true },

    amount: { type: Number, required: true },

    status: {
      type: String,
      enum: ["CREATED", "INITIATED", "PAID", "FAILED", "CANCELLED"],
      default: "CREATED",
      index: true,
    },

    providerPayload: { type: Object, default: {} },
    providerReference: { type: String, default: "" },
    paymentUrl: { type: String, default: "" },
  },
  { timestamps: true }
);

/**
 * Helpful indexes
 */

// Get latest intents for a household quickly
PaymentIntentSchema.index(
  { userId: 1, householdId: 1, createdAt: -1 },
  { name: "intent_by_household_recent" }
);

// Query by provider ref quickly (Khalti pidx etc.)
PaymentIntentSchema.index(
  { provider: 1, providerReference: 1 },
  { name: "intent_provider_reference" }
);

// Month/year lookup scoped to household
PaymentIntentSchema.index(
  { userId: 1, householdId: 1, kind: 1, targetYear: 1, targetMonth: 1, status: 1 },
  { name: "intent_month_lookup" }
);

module.exports = mongoose.model("PaymentIntent", PaymentIntentSchema);

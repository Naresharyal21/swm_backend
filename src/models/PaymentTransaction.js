const mongoose = require("mongoose");

const PaymentTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: "BillingPlan", required: true },

    provider: { type: String, enum: ["ESEWA", "MOCK"], required: true },
    transactionUuid: { type: String, required: true, unique: true, index: true },

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

module.exports = mongoose.model("PaymentTransaction", PaymentTransactionSchema);

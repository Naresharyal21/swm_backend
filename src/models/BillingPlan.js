// src/models/BillingPlan.js
const mongoose = require("mongoose");

const MODES = ["MONTHLY", "ANNUAL", "DAILY_PICKUP"];

const BillingPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },

    billingMode: {
      type: String,
      enum: MODES,
      default: "MONTHLY",
      index: true,
    },

    monthlyFee: { type: Number, default: 0, min: 0 },
    annualFee: { type: Number, default: 0, min: 0 },
    dailyPickupFee: { type: Number, default: 0, min: 0 },

    bulkyDailyChargeOverride: { type: Number, default: null, min: 0 },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// --------------------
// Shared validation
// --------------------
function validatePlan(docLike) {
  const mode = docLike.billingMode;

  // MONTHLY
  if (mode === "MONTHLY") {
    if ((docLike.monthlyFee ?? 0) < 0) throw new Error("monthlyFee must be >= 0");
  }

  // ANNUAL (strict)
  if (mode === "ANNUAL") {
    if ((docLike.annualFee ?? 0) <= 0) throw new Error("annualFee must be > 0 for ANNUAL mode");
  }

  // DAILY_PICKUP (strict)
  if (mode === "DAILY_PICKUP") {
    if ((docLike.dailyPickupFee ?? 0) <= 0)
      throw new Error("dailyPickupFee must be > 0 for DAILY_PICKUP mode");
  }

  // bulky override
  if (docLike.bulkyDailyChargeOverride != null && (docLike.bulkyDailyChargeOverride ?? 0) < 0) {
    throw new Error("bulkyDailyChargeOverride must be >= 0");
  }
}

// --------------------
// Create/save validation
// --------------------
BillingPlanSchema.pre("save", function (next) {
  try {
    validatePlan(this);
    next();
  } catch (e) {
    next(e);
  }
});

// --------------------
// Update validation (IMPORTANT)
// This runs for findOneAndUpdate/findByIdAndUpdate too.
// --------------------
BillingPlanSchema.pre(["findOneAndUpdate", "updateOne", "updateMany"], async function (next) {
  try {
    const update = this.getUpdate() || {};
    const $set = update.$set || {};

    // Build the "after update" object:
    // 1) load current document
    const current = await this.model.findOne(this.getQuery()).lean();
    if (!current) return next(); // let controller handle not found

    // 2) apply update changes
    const merged = {
      ...current,
      ...update,
      ...$set,
    };

    // If update contains $unset, apply it
    if (update.$unset) {
      for (const k of Object.keys(update.$unset)) {
        delete merged[k];
      }
    }

    // Validate merged state
    validatePlan(merged);

    // Also ensure mongoose runs schema validators for min, enum, etc.
    this.setOptions({ runValidators: true, new: true });

    next();
  } catch (e) {
    next(e);
  }
});

module.exports = mongoose.model("BillingPlan", BillingPlanSchema);

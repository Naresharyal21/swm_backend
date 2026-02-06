const mongoose = require('mongoose');

const BillingPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    billingMode: { type: String, enum: ['MONTHLY', 'DAILY_PICKUP'], default: 'MONTHLY', index: true },
    // For MONTHLY mode
    monthlyFee: { type: Number, default: 0 },
    // For DAILY_PICKUP mode (charged ONLY when pickup completed)
    dailyPickupFee: { type: Number, default: 0 },
    bulkyDailyChargeOverride: { type: Number, default: null },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

BillingPlanSchema.pre('save', function validateMode(next) {
  if (this.billingMode === 'MONTHLY' && (this.monthlyFee ?? 0) < 0) {
    return next(new Error('monthlyFee must be >= 0'));
  }
  if (this.billingMode === 'DAILY_PICKUP' && (this.dailyPickupFee ?? 0) <= 0) {
    return next(new Error('dailyPickupFee must be > 0 for DAILY_PICKUP mode'));
  }
  return next();
});

module.exports = mongoose.model('BillingPlan', BillingPlanSchema);

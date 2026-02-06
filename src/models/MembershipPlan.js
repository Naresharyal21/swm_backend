const mongoose = require('mongoose');

const MembershipPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: '' },
    // Membership subscription fee charged monthly
    monthlyFee: { type: Number, default: 0 },
    // Discount applied to invoice service charges (0-100)
    discountPercent: { type: Number, default: 0 },
    // Bonus added to recyclable payout amount (0-100)
    recyclableBonusPercent: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

MembershipPlanSchema.pre('save', function (next) {
  const dp = Number(this.discountPercent || 0);
  const bp = Number(this.recyclableBonusPercent || 0);
  if (dp < 0 || dp > 100) return next(new Error('discountPercent must be between 0 and 100'));
  if (bp < 0 || bp > 100) return next(new Error('recyclableBonusPercent must be between 0 and 100'));
  if ((this.monthlyFee ?? 0) < 0) return next(new Error('monthlyFee must be >= 0'));
  return next();
});

module.exports = mongoose.model('MembershipPlan', MembershipPlanSchema);

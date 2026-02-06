const mongoose = require('mongoose');

const RewardClaimSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: { type: String, required: true },
    quantity: { type: Number, required: true },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING', index: true },
    proofEvidenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Evidence', default: null },
    amountCredit: { type: Number, default: 0 },
    reviewedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    note: { type: String, default: '' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('RewardClaim', RewardClaimSchema);

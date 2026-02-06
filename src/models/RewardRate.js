const mongoose = require('mongoose');

const RewardRateSchema = new mongoose.Schema(
  {
    category: { type: String, required: true, unique: true, trim: true },
    ratePerUnit: { type: Number, required: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('RewardRate', RewardRateSchema);

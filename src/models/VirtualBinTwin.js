const mongoose = require('mongoose');

const VirtualBinTwinSchema = new mongoose.Schema(
  {
    virtualBinId: { type: mongoose.Schema.Types.ObjectId, ref: 'VirtualBin', required: true, unique: true },
    computedAt: { type: Date, required: true },
    binsCount: { type: Number, required: true },
    over80Count: { type: Number, required: true },
    over95Count: { type: Number, required: true },
    offlineCount: { type: Number, required: true },
    avgFill: { type: Number, required: true },
    maxFill: { type: Number, required: true },
    pctOver80: { type: Number, required: true },
    pctOver95: { type: Number, required: true },
    offlinePct: { type: Number, required: true },
    riskScore: { type: Number, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('VirtualBinTwin', VirtualBinTwinSchema);

const mongoose = require('mongoose');

const BinTwinLatestSchema = new mongoose.Schema(
  {
    binId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bin', required: true, unique: true },
    lastSeenAt: { type: Date, required: true },
    fillPercent: { type: Number, required: true, min: 0, max: 100 },
    batteryPercent: { type: Number, default: null, min: 0, max: 100 },
    batteryState: { type: String, default: 'OK' },
    isOffline: { type: Boolean, default: false }
  },
  { timestamps: true }
);

BinTwinLatestSchema.index({ isOffline: 1 });

module.exports = mongoose.model('BinTwinLatest', BinTwinLatestSchema);

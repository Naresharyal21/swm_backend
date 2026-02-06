const mongoose = require('mongoose');

const BinSchema = new mongoose.Schema(
  {
    binId: { type: String, required: true, unique: true, trim: true },
    householdId: { type: mongoose.Schema.Types.ObjectId, ref: 'Household', required: true, index: true },
    virtualBinId: { type: mongoose.Schema.Types.ObjectId, ref: 'VirtualBin', default: null, index: true },
    fillPercent: { type: Number, required: true, min: 0, max: 100 },
    batteryPercent: { type: Number, default: null, min: 0, max: 100 },
    batteryState: { type: String, default: 'OK' },
    isOffline: { type: Boolean, default: false },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }
    },
    status: { type: String, default: 'ACTIVE' }
  },
  { timestamps: true }
);

BinSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Bin', BinSchema);

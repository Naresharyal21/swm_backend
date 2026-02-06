const mongoose = require('mongoose');

const VirtualBinSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', required: true, index: true },
    centroid: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }
    },
    polygon: { type: Object, default: null },
    thresholds: {
      over80: { type: Number, default: null },
      over95: { type: Number, default: null },
      risk: { type: Number, default: null }
    },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

VirtualBinSchema.index({ centroid: '2dsphere' });

module.exports = mongoose.model('VirtualBin', VirtualBinSchema);

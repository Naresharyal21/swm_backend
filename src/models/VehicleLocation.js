const mongoose = require('mongoose');

const VehicleLocationSchema = new mongoose.Schema(
  {
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    source: { type: String, enum: ['MANUAL', 'CREW_MOBILE'], default: 'MANUAL', index: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true } // [lng, lat]
    }
  },
  { timestamps: true }
);

VehicleLocationSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('VehicleLocation', VehicleLocationSchema);

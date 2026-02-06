const mongoose = require('mongoose');
const { VEHICLE_TYPES } = require('../config/constants');

const VehicleSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    vehicleType: { type: String, enum: Object.values(VEHICLE_TYPES), required: true, index: true },
    capacityKg: { type: Number, default: null },
    isActive: { type: Boolean, default: true, index: true },
    shiftStart: { type: String, default: '08:00' },
    shiftEnd: { type: String, default: '16:00' },
    crewUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Vehicle', VehicleSchema);

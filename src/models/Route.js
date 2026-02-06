const mongoose = require('mongoose');
const { VEHICLE_TYPES } = require('../config/constants');

const RouteSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    vehicleType: { type: String, enum: Object.values(VEHICLE_TYPES), required: true, index: true },
    status: { type: String, enum: ['DRAFT', 'PUBLISHED'], default: 'DRAFT', index: true },
    version: { type: Number, default: 1, index: true },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    publishedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    publishedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

RouteSchema.index({ date: 1, vehicleId: 1, version: 1 }, { unique: true });

module.exports = mongoose.model('Route', RouteSchema);

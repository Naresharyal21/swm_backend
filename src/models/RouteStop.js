const mongoose = require('mongoose');

const RouteStopSchema = new mongoose.Schema(
  {
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Route', required: true, index: true },
    order: { type: Number, required: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }
    },
    taskIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
    eta: { type: Date, default: null },
    distanceKm: { type: Number, default: null },
    durationMin: { type: Number, default: null }
  },
  { timestamps: true }
);

RouteStopSchema.index({ routeId: 1, order: 1 }, { unique: true });
RouteStopSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('RouteStop', RouteStopSchema);

const mongoose = require('mongoose');

const TelemetrySchema = new mongoose.Schema(
  {
    binId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bin', required: true, index: true },
    ts: { type: Date, required: true },
    fillPercent: { type: Number, required: true, min: 0, max: 100 },
    batteryPercent: { type: Number, default: null, min: 0, max: 100 }
  },
  { timestamps: true }
);

TelemetrySchema.index({ binId: 1, ts: 1 }, { unique: true });

module.exports = mongoose.model('Telemetry', TelemetrySchema);

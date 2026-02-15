const mongoose = require("mongoose");

const TelemetrySchema = new mongoose.Schema(
  {
    binId: { type: mongoose.Schema.Types.ObjectId, ref: "Bin", required: true, index: true },

    // ✅ remove index:true here (TTL index below already creates {ts:1})
    ts: { type: Date, required: true },

    fillPercent: { type: Number, required: true, min: 0, max: 100 },
    batteryPercent: { type: Number, default: null, min: 0, max: 100 },
  },
  { timestamps: true, collection: "telemetries" } // keep consistent
);

TelemetrySchema.index({ binId: 1, ts: 1 }, { unique: true });

// ✅ TTL: auto-delete after 60 seconds since ts
TelemetrySchema.index({ ts: 1 }, { expireAfterSeconds: 60 });

module.exports = mongoose.model("Telemetry", TelemetrySchema);

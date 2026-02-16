const mongoose = require("mongoose");

const DeviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true, index: true },
    deviceKey: { type: String, required: true },

    // Link to web-server Bin using Bin.binId (e.g. "BIN-03")
    binId: { type: String, default: null, index: true },

    isActive: { type: Boolean, default: false, index: true },
    pairedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "iot_devices" } // ✅ IMPORTANT: exact shared collection name
);

// prevent multiple devices linking to same binId
DeviceSchema.index({ binId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Device", DeviceSchema);

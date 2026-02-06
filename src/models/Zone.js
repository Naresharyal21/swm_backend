const mongoose = require("mongoose");

const ZoneSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    // ✅ compulsory now
    wardCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
    },

    polygon: { type: Object, default: null }, // GeoJSON
    centroid: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: [0, 0] },
    },
  },
  { timestamps: true },
);

ZoneSchema.index({ wardCode: 1 }, { unique: true }); // ✅ unique ward
ZoneSchema.index({ centroid: "2dsphere" });

module.exports = mongoose.model("Zone", ZoneSchema);

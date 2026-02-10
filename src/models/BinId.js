const mongoose = require("mongoose");

const BinIdSchema = new mongoose.Schema(
  {
    // Example: "BIN-000001"
    code: { type: String, required: true, unique: true, index: true },

    // Optional: store numeric for faster range queries if you want
    // num: { type: Number, required: true, index: true },

    isAssigned: { type: Boolean, default: false },
    assignedToBin: { type: mongoose.Schema.Types.ObjectId, ref: "Bin", default: null },

    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BinId", BinIdSchema);

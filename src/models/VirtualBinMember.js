const mongoose = require('mongoose');

const VirtualBinMemberSchema = new mongoose.Schema(
  {
    virtualBinId: { type: mongoose.Schema.Types.ObjectId, ref: 'VirtualBin', required: true, index: true },
    binId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bin', required: true, index: true }
  },
  { timestamps: true }
);

VirtualBinMemberSchema.index({ virtualBinId: 1, binId: 1 }, { unique: true });

module.exports = mongoose.model('VirtualBinMember', VirtualBinMemberSchema);

const mongoose = require('mongoose');

const WalletTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
    amount: { type: Number, required: true },
    reason: { type: String, default: '' },
    refType: { type: String, default: '' },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('WalletTransaction', WalletTransactionSchema);

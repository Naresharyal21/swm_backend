const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refKind: { type: String, enum: ['INVOICE', 'SERVICE_CHARGE'], required: true, index: true },
    refId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    amount: { type: Number, required: true },
    method: { type: String, enum: ['CASH', 'ONLINE', 'KHALTI_TEST'], default: 'CASH', index: true },
    status: { type: String, enum: ['SUCCEEDED', 'FAILED', 'PENDING'], default: 'SUCCEEDED', index: true },

    receiptNo: { type: String, required: true, unique: true, index: true },
    paidAt: { type: Date, required: true, index: true },

    meta: { type: Object, default: {} }
  },
  { timestamps: true }
);

PaymentSchema.index({ userId: 1, paidAt: -1 });

module.exports = mongoose.model('Payment', PaymentSchema);

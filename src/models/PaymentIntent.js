const mongoose = require('mongoose');

const PaymentIntentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
    provider: { type: String, enum: ['MOCK', 'KHALTI'], required: true, index: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['CREATED', 'INITIATED', 'PAID', 'FAILED', 'CANCELLED'], default: 'CREATED', index: true },
    providerPayload: { type: Object, default: {} },
    providerReference: { type: String, default: '' },
    paymentUrl: { type: String, default: '' },
    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() }
  },
  { timestamps: true }
);

module.exports = mongoose.model('PaymentIntent', PaymentIntentSchema);

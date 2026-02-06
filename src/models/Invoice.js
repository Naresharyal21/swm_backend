const mongoose = require('mongoose');

const InvoiceItemSchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // YYYY-MM-DD
    kind: { type: String, required: true },
    description: { type: String, default: '' },
    amount: { type: Number, required: true }
  },
  { _id: false }
);

const InvoiceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    month: { type: String, required: true, index: true }, // YYYY-MM
    status: { type: String, enum: ['DRAFT', 'ISSUED', 'PAID'], default: 'ISSUED', index: true },
    items: { type: [InvoiceItemSchema], default: [] },
    total: { type: Number, required: true },
    creditsApplied: { type: Number, default: 0 },
    amountDue: { type: Number, required: true },
    generatedAt: { type: Date, required: true },
    paidAt: { type: Date, default: null }
  },
  { timestamps: true }
);

InvoiceSchema.index({ userId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Invoice', InvoiceSchema);

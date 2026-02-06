const mongoose = require('mongoose');

const ServiceChargeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    householdId: { type: mongoose.Schema.Types.ObjectId, ref: 'Household', default: null, index: true },
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Case', default: null, index: true },

    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true, unique: true, index: true },

    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    kind: { type: String, default: 'BULKY_DAILY', index: true },
    description: { type: String, default: '' },
    amount: { type: Number, required: true },

    status: { type: String, enum: ['UNPAID', 'PAID'], default: 'UNPAID', index: true },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null, index: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null, index: true },
    paidAt: { type: Date, default: null }
  },
  { timestamps: true }
);

ServiceChargeSchema.index({ userId: 1, status: 1, date: -1 });

module.exports = mongoose.model('ServiceCharge', ServiceChargeSchema);

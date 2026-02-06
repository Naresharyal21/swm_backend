const mongoose = require('mongoose');
const { CASE_TYPES, CASE_STATUSES } = require('../config/constants');

const CaseSchema = new mongoose.Schema(
  {
    type: { type: String, enum: Object.values(CASE_TYPES), required: true, index: true },
    status: { type: String, enum: Object.values(CASE_STATUSES), required: true, index: true },
    isOpen: { type: Boolean, default: true, index: true },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    householdId: { type: mongoose.Schema.Types.ObjectId, ref: 'Household', default: null, index: true },
    zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', default: null, index: true },
    virtualBinId: { type: mongoose.Schema.Types.ObjectId, ref: 'VirtualBin', default: null, index: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }
    },
    description: { type: String, default: '' },
    bulkyWeightKg: { type: Number, default: null },
    // ✅ For ROUTINE_PICKUP cases, this indicates the pickup date (YYYY-MM-DD)
    serviceDate: { type: String, default: null, index: true },
    priority: { type: Number, default: 3 },
    slaDeadline: { type: Date, default: null },
    validation: {
      validatedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      validatedAt: { type: Date, default: null },
      note: { type: String, default: '' }
    }
  },
  { timestamps: true }
);

CaseSchema.index({ location: '2dsphere' });
CaseSchema.index(
  { virtualBinId: 1, type: 1, isOpen: 1 },
  {
    unique: true,
    partialFilterExpression: { type: CASE_TYPES.BIN_SERVICE, isOpen: true }
  }
);

// ✅ Ensure at most one routine pickup case per household per day
CaseSchema.index(
  { householdId: 1, type: 1, serviceDate: 1 },
  {
    unique: true,
    partialFilterExpression: { type: CASE_TYPES.ROUTINE_PICKUP, serviceDate: { $type: 'string' } }
  }
);

module.exports = mongoose.model('Case', CaseSchema);

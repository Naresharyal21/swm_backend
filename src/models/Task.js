const mongoose = require('mongoose');
const { TASK_STATUSES, REQUIRED_VEHICLE } = require('../config/constants');

const TaskSchema = new mongoose.Schema(
  {
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Case', required: true, index: true },
    requiredVehicle: { type: String, enum: Object.values(REQUIRED_VEHICLE), required: true, index: true },
    estimatedWeightKg: { type: Number, default: null },
    status: { type: String, enum: Object.values(TASK_STATUSES), required: true, index: true },
    assignedToUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null, index: true },
    scheduledDate: { type: String, default: null, index: true }, // YYYY-MM-DD
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    proofEvidenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Evidence', default: null },
    failureReason: { type: String, default: '' },
    stopLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }
    }
  },
  { timestamps: true }
);

TaskSchema.index({ stopLocation: '2dsphere' });

module.exports = mongoose.model('Task', TaskSchema);

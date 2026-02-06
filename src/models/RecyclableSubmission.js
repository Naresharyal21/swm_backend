const mongoose = require('mongoose');

const RecyclableSubmissionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    householdId: { type: mongoose.Schema.Types.ObjectId, ref: 'Household', required: true, index: true },
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Case', required: true, unique: true },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true, unique: true },

    category: { type: String, required: true, trim: true, index: true },
    pieces: { type: Number, default: 0 },
    avgWeightKg: { type: Number, default: 0 },
    estimatedTotalWeightKg: { type: Number, default: 0 },
    evidenceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Evidence' }],

    status: { type: String, enum: ['PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'], default: 'PENDING_VERIFICATION', index: true },

    // Computed based on RewardRate at submission time
    estimatedPayout: { type: Number, default: 0 },

    verification: {
      verifiedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      verifiedAt: { type: Date, default: null },
      verifiedPieces: { type: Number, default: 0 },
      verifiedTotalWeightKg: { type: Number, default: 0 },
      verifiedPayout: { type: Number, default: 0 },
      note: { type: String, default: '' }
    }
  },
  { timestamps: true }
);

RecyclableSubmissionSchema.index({ householdId: 1, createdAt: -1 });

module.exports = mongoose.model('RecyclableSubmission', RecyclableSubmissionSchema);

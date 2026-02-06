const mongoose = require('mongoose');

const EvidenceSchema = new mongoose.Schema(
  {
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    relatedTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null, index: true },
    relatedCaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Case', default: null, index: true },
    kind: { type: String, enum: ['PHOTO', 'DOCUMENT'], default: 'PHOTO' },
    s3Key: { type: String, required: true, unique: true },
    mimeType: { type: String, default: '' },
    sizeBytes: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Evidence', EvidenceSchema);

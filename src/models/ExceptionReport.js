const mongoose = require('mongoose');

const ExceptionReportSchema = new mongoose.Schema(
  {
    crewUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null, index: true },
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Route', default: null, index: true },
    category: { type: String, required: true, index: true },
    description: { type: String, required: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }
    }
  },
  { timestamps: true }
);

ExceptionReportSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('ExceptionReport', ExceptionReportSchema);

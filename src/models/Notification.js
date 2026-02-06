const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['TRUCK_NEARBY', 'GENERAL'], default: 'GENERAL', index: true },
    title: { type: String, default: '' },
    message: { type: String, default: '' },
    meta: { type: Object, default: {} },
    readAt: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', NotificationSchema);

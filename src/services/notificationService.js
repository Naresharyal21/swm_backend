const Notification = require('../models/Notification');

async function createNotification({ userId, kind = 'GENERAL', title = '', message = '', meta = {} }) {
  return Notification.create({ userId, kind, title, message, meta });
}

async function listNotifications({ userId, limit = 50, unreadOnly = false }) {
  const q = { userId };
  if (unreadOnly) q.readAt = null;
  const items = await Notification.find(q).sort({ createdAt: -1 }).limit(limit).lean();
  return items;
}

async function markAsRead({ userId, notificationId }) {
  const n = await Notification.findOne({ _id: notificationId, userId });
  if (!n) return null;
  n.readAt = n.readAt || new Date();
  await n.save();
  return n;
}

module.exports = { createNotification, listNotifications, markAsRead };

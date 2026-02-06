const AuditLog = require('../models/AuditLog');

async function audit({ actorUserId, action, entityType = '', entityId = null, meta = {}, req = null }) {
  const ip = req ? (req.headers['x-forwarded-for'] || req.ip || '') : '';
  const userAgent = req ? (req.headers['user-agent'] || '') : '';
  await AuditLog.create({ actorUserId, action, entityType, entityId, meta, ip, userAgent });
}

module.exports = { audit };

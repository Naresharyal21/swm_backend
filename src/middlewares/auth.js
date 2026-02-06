const jwt = require('jsonwebtoken')
const env = require('../config/env')
const User = require('../models/User')
const { unauthorized, forbidden } = require('../utils/errors')

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || ''
    const [scheme, token] = header.split(' ')

    if (scheme !== 'Bearer' || !token) {
      return next(unauthorized('Missing token'))
    }

    const payload = jwt.verify(token, env.jwt.accessSecret)

    // Load latest user from DB (role changes take effect immediately)
    const user = await User.findById(payload.sub)
      .select('_id email role isActive name phone')
      .lean()

    if (!user) return next(unauthorized('User not found'))

    // If disabled -> forbid (not unauthorized)
    if (user.isActive === false) return next(forbidden('Account disabled'))

    req.user = user
    req.auth = { sub: payload.sub, payload } // optional for debugging
    return next()
  } catch (err) {
    return next(unauthorized('Invalid/expired token'))
  }
}

function requireRole(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.user) return next(unauthorized('Not authenticated'))
    if (!roles.includes(req.user.role)) return next(forbidden('Forbidden'))
    return next()
  }
}

module.exports = { authenticate, requireRole }

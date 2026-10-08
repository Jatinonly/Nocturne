import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { config } from '../config.js'
import { HttpError } from '../lib/httpError.js'

export function signToken(userId) {
  // {} means there is no custom data in the main payload.
  return jwt.sign({}, config.jwt.secret, {
    subject: userId,
    expiresIn: config.jwt.expiresIn,
    algorithm: 'HS256',
  })
}

/** Requires `Authorization: Bearer <token>`; sets `req.userId`. */
export function requireAuth(req, _res, next) {
  const header = req.get('authorization') ?? ''
  const [scheme, token] = header.split(' ')
  if (scheme !== 'Bearer' || !token) return next(new HttpError(401, 'Please log in to continue'))
  try {
    const payload = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] })
    // Tokens issued before the MongoDB switch carry a Postgres uuid; treat them as expired.
    if (!mongoose.isObjectIdOrHexString(payload.sub)) throw new Error('Invalid user id')
    req.userId = payload.sub
    next()
  } catch {
    next(new HttpError(401, 'Your session has expired. Please log in again.'))
  }
}

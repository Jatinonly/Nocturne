/** Reads and validates environment variables once at startup. */
/* So instead of doing this everywhere:
    process.env.MONGODB_URI
    process.env.JWT_SECRET
    process.env.PORT

  your application can do:
    config.db.uri
    config.jwt.secret
    config.port
*/

import { HttpError } from './lib/httpError.js'

function required(name) {
  const value = process.env[name]
  if (!value) {
    throw new HttpError(503, `Missing env var ${name}.`)
  }
  return value
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigins: (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  db: {
    get uri() {
      return required('MONGODB_URI')
    },
  },
  jwt: {
    get secret() {
      return required('JWT_SECRET')
    },
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },
  razorpay: {
    mock: (process.env.RAZORPAY_MOCK ?? 'false').toLowerCase() === 'true',
    get keyId() {
      return required('RAZORPAY_KEY_ID')
    },
    get keySecret() {
      return required('RAZORPAY_KEY_SECRET')
    },
    get webhookSecret() {
      return required('RAZORPAY_WEBHOOK_SECRET')
    },
  },
  shipping: {
    freeThreshold: Number(process.env.FREE_SHIPPING_THRESHOLD ?? 2999),
    fee: Number(process.env.SHIPPING_FEE ?? 99),
  },
}

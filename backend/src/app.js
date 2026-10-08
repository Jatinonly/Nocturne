import cors from 'cors'
import express from 'express'
import { config } from './config.js'
import { connectDb, pingDb } from './db/mongo.js'
import { errorHandler, notFound } from './middleware/errors.js'
import { authRouter } from './routes/auth.js'
import { ordersRouter } from './routes/orders.js'
import { paymentsRouter } from './routes/payments.js'
import { productsRouter } from './routes/products.js'

export const app = express()

app.disable('x-powered-by') // Disables the X-Powered-By: Express HTTP response header.
if (config.corsOrigins.length) app.use(cors({ origin: config.corsOrigins }))
app.use('/api/payments/razorpay/webhook', express.raw({ type: 'application/json', limit: '100kb' }))
app.use(express.json({ limit: '100kb' }))

/** GET /api/health — also checks the database connection. */
app.get('/api/health', async (_req, res) => {
  try {
    await pingDb()
    res.json({ ok: true, database: 'connected' })
  } catch (error) {
    res.status(503).json({ ok: false, database: 'unreachable', message: error.message })
  }
})

// Opens the database connection on the first request (no-op after that).
app.use('/api', async (_req, _res, next) => {
  await connectDb()
  next()
})

app.use('/api/auth', authRouter)
app.use('/api/products', productsRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/payments', paymentsRouter)

app.use(notFound)
app.use(errorHandler)

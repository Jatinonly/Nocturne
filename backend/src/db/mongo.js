/* mongo.js mainly contains the MongoDB connection setup (via Mongoose).
- connectDb() opens the connection on first use and reuses it afterwards.
- withTransaction() runs a function inside a transaction (commit on success, abort on error).
- closeDb() closes the connection on shutdown or at the end of a script. */
import mongoose from 'mongoose'
import { config } from '../config.js'
import { HttpError } from '../lib/httpError.js'

// Fail fast instead of queueing queries forever when the connection is down.
mongoose.set('bufferCommands', false)
mongoose.connection.on('error', (error) => console.error('MongoDB error:', error.message))

let connecting = null

/** Opened on first use, so the server can boot (and say what's missing) before .env is filled in. */
export function connectDb() {
  if (connecting) return connecting
  if (!process.env.MONGODB_URI) {
    throw new HttpError(503, 'Database not configured: set MONGODB_URI in backend/.env')
  }
  connecting = mongoose
    .connect(config.db.uri, {
      maxPoolSize: 10, // maximum number of database connections in the pool.
      serverSelectionTimeoutMS: 10000,
    })
    .catch((error) => {
      connecting = null // let the next request try again
      throw error
    })
  return connecting
}

export async function closeDb() {
  if (connecting) await mongoose.disconnect()
  connecting = null
}

/** Pings the server; used by the health check. */
export async function pingDb() {
  await connectDb()
  await mongoose.connection.db.admin().ping()
}

/**
 * Runs `fn(session)` in a transaction. Pass `session` to every query inside it.
 * Transactions need a replica set (MongoDB Atlas clusters always are one).
 */
export async function withTransaction(fn) {
  await connectDb()
  return mongoose.connection.transaction(fn)
}

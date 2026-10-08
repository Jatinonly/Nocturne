import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { User } from '../models/index.js'
import { HttpError } from '../lib/httpError.js'
import * as v from '../lib/validate.js'
import { requireAuth, signToken } from '../middleware/auth.js'

export const authRouter = Router()

const BCRYPT_ROUNDS = 12
// Compared against when the email doesn't exist, so response time doesn't reveal which emails are registered.
// bcrypt.hashSync() is the synchronous version of bcrypt.hash() because the code needs the hash immediately so it can store it in DUMMY_HASH
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS)

function toUser(doc) {
  return {
    id: doc._id.toString(),
    name: doc.name,
    email: doc.email,
    ...(doc.phone ? { phone: doc.phone } : {}),
    createdAt: doc.createdAt.toISOString(),
  }
}

const toSession = (doc) => ({ user: toUser(doc), token: signToken(doc._id.toString()) })

/** POST /api/auth/signup { name, email, password } → { user, token } */
authRouter.post('/signup', async (req, res) => {
  const name = v.str(req.body?.name, 'Name', { min: 2, max: 120 })
  const email = v.email(req.body?.email)
  const password = v.str(req.body?.password, 'Password', { min: 8, max: 72 }) // bcrypt reads at most 72 bytes

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS)
  try {
    const user = await User.create({ name, email, passwordHash: hash })
    res.status(201).json(toSession(user))
  } catch (error) {
    if (error.code === 11000) throw new HttpError(409, 'An account with this email already exists')
    throw error
  }
})

/** POST /api/auth/login { email, password } → { user, token } */
authRouter.post('/login', async (req, res) => {
  const email = v.email(req.body?.email)
  const password = typeof req.body?.password === 'string' ? req.body.password : ''

  // v.email() already lower-cases, matching how emails are stored.
  const user = await User.findOne({ email }).lean()
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)
  if (!user || !valid) throw new HttpError(401, 'Incorrect email or password')
  res.json(toSession(user))
})

/** GET /api/auth/me → { user } */
authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId).lean()
  if (!user) throw new HttpError(401, 'Your session has expired. Please log in again.')
  res.json({ user: toUser(user) })
})

/** POST /api/auth/logout — extra route for cookie */
authRouter.post('/logout', (_req, res) => {
  res.status(204).end()
})

/**
 * Authentication.
 *
 * API mode (VITE_API_BASE_URL set) — backend/src/routes/auth.js, bcrypt + JWT in MongoDB:
 *   login  → POST /auth/login   { email, password } → { user, token }
 *   signup → POST /auth/signup  { name, email, password } → { user, token }
 *   logout → POST /auth/logout
 *
 * Mock mode — users live in a localStorage "table" and passwords are NOT secure.
 */
import { env } from '@/config/env'
import { createId } from '@/lib/id'
import { ApiError, apiRequest, mockDelay, mockTable } from './http'

/**
 * @typedef {object} User
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {string} [phone]
 * @property {string} createdAt
 */

/**
 * @typedef {{ user: User, token: string }} AuthSession
 * @typedef {{ email: string, password: string }} LoginInput
 * @typedef {{ name: string, email: string, password: string }} SignupInput
 */

const users = mockTable('users')

export const DEMO_CREDENTIALS = { email: 'demo@nocturne.in', password: 'password123' }

function seedDemoUser() {
  const rows = users.read()
  if (!rows.some((user) => user.email === DEMO_CREDENTIALS.email)) {
    users.write([
      ...rows,
      {
        id: 'u_demo',
        name: 'Aanya Sharma',
        email: DEMO_CREDENTIALS.email,
        password: DEMO_CREDENTIALS.password,
        phone: '9876543210',
        createdAt: new Date('2026-01-12').toISOString(),
      },
    ])
  }
}

function toSession(stored) {
  const user = {
    id: stored.id,
    name: stored.name,
    email: stored.email,
    phone: stored.phone,
    createdAt: stored.createdAt,
  }
  return { user, token: `mock-token-${user.id}-${Date.now()}` }
}

/**
 * @param {LoginInput} input
 * @returns {Promise<AuthSession>}
 */
export async function login(input) {
  if (!env.useMockApi) {
    return apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(input), auth: false })
  }
  await mockDelay(600)
  seedDemoUser()
  const user = users
    .read()
    .find((row) => row.email.toLowerCase() === input.email.trim().toLowerCase())
  if (!user || user.password !== input.password) {
    throw new ApiError('Incorrect email or password', 401)
  }
  return toSession(user)
}

/**
 * @param {SignupInput} input
 * @returns {Promise<AuthSession>}
 */
export async function signup(input) {
  if (!env.useMockApi) {
    return apiRequest('/auth/signup', { method: 'POST', body: JSON.stringify(input), auth: false })
  }
  await mockDelay(700)
  seedDemoUser()
  const rows = users.read()
  const email = input.email.trim().toLowerCase()
  if (rows.some((row) => row.email.toLowerCase() === email)) {
    throw new ApiError('An account with this email already exists', 409)
  }
  const user = {
    id: createId('u_'),
    name: input.name.trim(),
    email,
    password: input.password,
    createdAt: new Date().toISOString(),
  }
  users.write([...rows, user])
  return toSession(user)
}

export async function logout() {
  if (!env.useMockApi) {
    await apiRequest('/auth/logout', { method: 'POST' }).catch(() => {})
    return
  }
  await mockDelay(150)
}

export const authService = { login, signup, logout }

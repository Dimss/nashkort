import crypto from 'node:crypto'
import { sessions, users } from './db.js'

const SCRYPT_KEYLEN = 64
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = (stored ?? '').split(':')
  if (!saltHex || !hashHex) return false
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  const actual = crypto.scryptSync(password, salt, expected.length)
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

// Returns a new session token on success, or null on invalid credentials.
export function login(email, password) {
  const user = users.getByEmail(email)
  if (!user || !verifyPassword(password, user.password_hash)) return null
  const token = crypto.randomBytes(32).toString('hex')
  const now = Date.now()
  sessions.insert(token, user.id, now, now + SESSION_TTL_MS)
  return token
}

// Returns { user_id, email } for a valid, non-expired session token, or null.
export function authenticate(token) {
  if (!token) return null
  return sessions.get(token)
}

export function logout(token) {
  if (token) sessions.delete(token)
}

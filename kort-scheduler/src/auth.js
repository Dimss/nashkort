import crypto from 'node:crypto'
import { sessions } from './db.js'

// Transitional: the password login was removed with its column. Sign-in is
// replaced by Auth0 in a later unit; until then only session lookup works.
export function login() {
  return null
}

export function authenticate(token) {
  if (!token) return null
  return sessions.get(crypto.createHash('sha256').update(token).digest('hex'))
}

export function logout(token) {
  if (token) sessions.delete(crypto.createHash('sha256').update(token).digest('hex'))
}

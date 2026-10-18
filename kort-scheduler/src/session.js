import crypto from 'node:crypto'
import { config } from './config.js'
import { sessions } from './db.js'

export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // absolute, 30 days
export const SIGN_IN_MAX_AGE_MS = 10 * 60 * 1000 // the transient sign-in cookie

// __Host- cookies require Secure, so both follow the base URL scheme.
function secure() {
  return config.baseUrl.startsWith('https://')
}

export function cookieName(base) {
  return secure() ? `__Host-${base}` : base
}

function cookieOptions(maxAge) {
  return { httpOnly: true, sameSite: 'lax', secure: secure(), path: '/', ...(maxAge ? { maxAge } : {}) }
}

export function getCookie(req, name) {
  const header = req.headers.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim())
      } catch {
        return null
      }
    }
  }
  return null
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// ---- app session ------------------------------------------------------------

export function readSession(req) {
  const token = getCookie(req, cookieName('session'))
  if (!token || typeof token !== 'string' || token.length > 256) return null
  return sessions.get(hashToken(token))
}

// Mints a fresh random token, stores only its hash, and returns the token for the cookie.
export function createSession(userId, hint) {
  const token = crypto.randomBytes(32).toString('hex')
  const now = Date.now()
  sessions.insert(hashToken(token), userId, hint ?? null, now, now + SESSION_MAX_AGE_MS)
  return token
}

export function setSessionCookie(res, token) {
  res.cookie(cookieName('session'), token, cookieOptions(SESSION_MAX_AGE_MS))
}

export function clearSessionCookie(res) {
  res.clearCookie(cookieName('session'), cookieOptions())
}

// Deletes the caller's session row (if any) and returns it, so the logout route can use its hint.
export function destroySession(req) {
  const session = readSession(req)
  if (session) sessions.delete(session.token_hash)
  return session
}

// ---- transient sign-in cookie (state, nonce, PKCE verifier, language) ---------

export function setSignInCookie(res, data) {
  const value = Buffer.from(JSON.stringify(data)).toString('base64url')
  res.cookie(cookieName('signin'), value, cookieOptions(SIGN_IN_MAX_AGE_MS))
}

export function readSignInCookie(req) {
  const raw = getCookie(req, cookieName('signin'))
  if (!raw || raw.length > 4096) return null
  try {
    const data = JSON.parse(Buffer.from(raw, 'base64url').toString())
    if (!data || typeof data !== 'object') return null
    for (const key of ['state', 'nonce', 'verifier']) if (typeof data[key] !== 'string' || !data[key]) return null
    return data
  } catch {
    return null
  }
}

export function clearSignInCookie(res) {
  res.clearCookie(cookieName('signin'), cookieOptions())
}

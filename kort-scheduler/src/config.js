import path from 'node:path'
import fs from 'node:fs'

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data')
fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase()
}

const WA_ROOT = path.join(DATA_DIR, 'wa')

const REQUIRED_ENV = ['ADMIN_EMAIL', 'BASE_URL', 'AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET']

// Names of required variables that are missing or blank; never a value.
export function validateConfig(env = process.env) {
  return REQUIRED_ENV.filter((name) => !env[name] || !String(env[name]).trim())
}

export const config = {
  port: Number(process.env.PORT) || 3000,
  dataDir: DATA_DIR,
  dbPath: path.join(DATA_DIR, 'scheduler.db'),
  backupPath: path.join(DATA_DIR, 'scheduler.pre-auth0.db'),
  // The single pre-multi-user link; moved to the admin's folder at first start.
  legacyAuthDir: path.join(DATA_DIR, 'auth'),
  waRoot: WA_ROOT,
  authDirFor(userId) {
    if (!Number.isInteger(userId) || userId <= 0) throw new TypeError('authDirFor needs a positive integer user id')
    return path.join(WA_ROOT, String(userId))
  },
  waLogLevel: process.env.WA_LOG_LEVEL || 'warn',
  // IANA zone for send times, recurrence and {{day}}/{{month}}/{{year}}.
  get timeZone() { return process.env.TIME_ZONE || 'Asia/Jerusalem' },
  // Backstop poll for due messages; sends normally go out on a timer set for
  // the exact send time (see scheduler.js)
  tickMs: 5000,
  // Retry policy for failed sends: one attempt, no retry. A failed send is
  // marked failed at once; a repeating series still moves on to its next date.
  maxAttempts: 1,
  retryDelayMs: 30_000,
  // Group list cache lifetime
  groupCacheMs: 60_000,
  // Read lazily so start-up validation runs before anything needs them.
  get adminEmail() { return normalizeEmail(process.env.ADMIN_EMAIL) },
  get baseUrl() { return String(process.env.BASE_URL || '').replace(/\/+$/, '') },
  get auth0() {
    return {
      domain: process.env.AUTH0_DOMAIN || '',
      clientId: process.env.AUTH0_CLIENT_ID || '',
      clientSecret: process.env.AUTH0_CLIENT_SECRET || '',
    }
  },
}

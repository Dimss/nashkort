import path from 'node:path'
import fs from 'node:fs'

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data')
fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase()
}

const REQUIRED_ENV = ['ADMIN_EMAIL', 'BASE_URL', 'AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET']

// Returns the names of required variables that are missing or blank. Never
// returns or logs a value.
export function validateConfig(env = process.env) {
  return REQUIRED_ENV.filter((name) => !env[name] || !String(env[name]).trim())
}

export const config = {
  port: Number(process.env.PORT) || 3000,
  dataDir: DATA_DIR,
  dbPath: path.join(DATA_DIR, 'scheduler.db'),
  backupPath: path.join(DATA_DIR, 'scheduler.pre-auth0.db'),
  // Credentials of the single pre-multi-user link; moved to the admin's folder at first start.
  legacyAuthDir: path.join(DATA_DIR, 'auth'),
  // Transitional alias for the single-connection client; removed when clients get their own folder.
  authDir: path.join(DATA_DIR, 'auth'),
  waRoot: path.join(DATA_DIR, 'wa'),
  authDirFor(userId) {
    if (!Number.isInteger(userId) || userId <= 0) throw new TypeError('authDirFor needs a positive integer user id')
    return path.join(DATA_DIR, 'wa', String(userId))
  },
  waLogLevel: process.env.WA_LOG_LEVEL || 'warn',
  // How often the scheduler checks for due messages
  tickMs: 5000,
  // Retry policy for failed sends
  maxAttempts: 5,
  retryDelayMs: 30_000,
  // Group list cache lifetime
  groupCacheMs: 60_000,
  // Read lazily so start-up validation runs first and tests can change them between runs.
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

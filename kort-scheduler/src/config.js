import path from 'node:path'
import fs from 'node:fs'

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data')
fs.mkdirSync(DATA_DIR, { recursive: true })

export const config = {
  port: Number(process.env.PORT) || 3000,
  dataDir: DATA_DIR,
  authDir: path.join(DATA_DIR, 'auth'),
  dbPath: path.join(DATA_DIR, 'scheduler.db'),
  waLogLevel: process.env.WA_LOG_LEVEL || 'warn',
  // How often the scheduler checks for due messages
  tickMs: 5000,
  // Retry policy for failed sends
  maxAttempts: 5,
  retryDelayMs: 30_000,
  // Group list cache lifetime
  groupCacheMs: 60_000,
}

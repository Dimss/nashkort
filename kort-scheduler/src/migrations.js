import fs from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

export const SCHEMA_VERSION = 1

// Tables in their current shape. On a database created by the old code the
// users and sessions tables already exist in the old shape, so these are no-ops
// there and the cutover below brings them up to date.
const TABLES = `
  CREATE TABLE IF NOT EXISTS scheduled_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_jid TEXT NOT NULL,
    group_name TEXT,
    message TEXT NOT NULL,
    send_at INTEGER NOT NULL,           -- epoch ms
    status TEXT NOT NULL DEFAULT 'pending', -- pending | sending | sent | failed | cancelled | missed
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER,            -- epoch ms, for retries
    error TEXT,
    created_at INTEGER NOT NULL,
    sent_at INTEGER,
    repeat_rule TEXT NOT NULL DEFAULT 'none', -- none | weekly | monthly
    series_id INTEGER,                  -- groups occurrences of the same recurring message
    owner_id INTEGER REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    auth0_sub TEXT,
    state TEXT NOT NULL DEFAULT 'pending', -- pending | approved | disabled
    created_at INTEGER NOT NULL,
    last_sign_in_at INTEGER
  );
`

const SESSIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sid TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )
`

const INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_sched_status_send_at ON scheduled_messages(status, send_at);
  CREATE INDEX IF NOT EXISTS idx_sched_owner ON scheduled_messages(owner_id, status, send_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth0_sub ON users(auth0_sub);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
`

// The one-way cutover from the password-login schema. Runs inside a single
// transaction so a crash leaves the old schema untouched. The password column
// is dropped before the admin upsert because its NOT NULL constraint would
// otherwise reject that insert.
export function cutoverStatements({ adminEmail, now }) {
  return [
    { sql: 'ALTER TABLE users ADD COLUMN auth0_sub TEXT' },
    { sql: "ALTER TABLE users ADD COLUMN state TEXT NOT NULL DEFAULT 'pending'" },
    { sql: 'ALTER TABLE users ADD COLUMN last_sign_in_at INTEGER' },
    { sql: 'ALTER TABLE scheduled_messages ADD COLUMN owner_id INTEGER REFERENCES users(id)' },
    { sql: 'ALTER TABLE users DROP COLUMN password_hash' },
    { sql: "INSERT INTO users (email, state, created_at) VALUES (?, 'approved', ?) ON CONFLICT(email) DO UPDATE SET state = 'approved'", params: [adminEmail, now] },
    { sql: 'UPDATE scheduled_messages SET owner_id = (SELECT id FROM users WHERE email = ?) WHERE owner_id IS NULL', params: [adminEmail] },
    { sql: 'DROP TABLE IF EXISTS sessions' },
    { sql: SESSIONS_TABLE },
    { sql: `PRAGMA user_version = ${SCHEMA_VERSION}` },
  ]
}

function hasColumn(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)
}

export function openDatabase(dbPath, { adminEmail, backupPath } = {}) {
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec(TABLES)
  db.exec(SESSIONS_TABLE)

  // Additive migrations from before repeat support existed (kept for very old files).
  for (const stmt of [
    `ALTER TABLE scheduled_messages ADD COLUMN repeat_rule TEXT NOT NULL DEFAULT 'none'`,
    `ALTER TABLE scheduled_messages ADD COLUMN series_id INTEGER`,
  ]) {
    try { db.exec(stmt) } catch (err) { if (!/duplicate column/i.test(err.message)) throw err }
  }

  const version = db.prepare('PRAGMA user_version').get().user_version
  if (version < SCHEMA_VERSION) {
    if (hasColumn(db, 'users', 'password_hash')) {
      if (!adminEmail) throw new Error('ADMIN_EMAIL is required to migrate the existing database')
      if (backupPath && !fs.existsSync(backupPath)) db.prepare('VACUUM INTO ?').run(backupPath)
      db.exec('BEGIN IMMEDIATE')
      try {
        for (const { sql, params = [] } of cutoverStatements({ adminEmail, now: Date.now() })) db.prepare(sql).run(...params)
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
    } else {
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    }
  }
  db.exec(INDEXES)
  return db
}

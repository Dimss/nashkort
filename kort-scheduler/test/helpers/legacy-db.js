// Builds a database with the pre-cutover schema (as shipped before the
// multi-user work) so migration tests start from what production has.
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'

export const LEGACY_EMAIL = 'legacy@example.com'

export function createLegacyDb(dir, { messages = 3, email = LEGACY_EMAIL } = {}) {
  const db = new DatabaseSync(join(dir, 'scheduler.db'))
  db.exec('PRAGMA journal_mode = WAL')
  db.exec(`
    CREATE TABLE scheduled_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_jid TEXT NOT NULL, group_name TEXT, message TEXT NOT NULL,
      send_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER, error TEXT,
      created_at INTEGER NOT NULL, sent_at INTEGER,
      repeat_rule TEXT NOT NULL DEFAULT 'none', series_id INTEGER
    );
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
  `)
  const now = Date.now()
  db.prepare('INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)').run(email, 'salt:hash', now)
  for (let i = 0; i < messages; i++) {
    db.prepare('INSERT INTO scheduled_messages (group_jid, message, send_at, created_at) VALUES (?, ?, ?, ?)')
      .run('g@g.us', `legacy ${i}`, now + (i + 1) * 3600_000, now)
  }
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, 1, ?, ?)').run('tok', now, now + 1000)
  db.close()
}

export function columns(dbPath, table) {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
  db.close()
  return cols
}

export function userVersion(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  const v = db.prepare('PRAGMA user_version').get().user_version
  db.close()
  return v
}

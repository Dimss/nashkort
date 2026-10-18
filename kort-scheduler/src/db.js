import { DatabaseSync } from 'node:sqlite'
import { config } from './config.js'

const db = new DatabaseSync(config.dbPath)
db.exec('PRAGMA journal_mode = WAL')
db.exec(`
  CREATE TABLE IF NOT EXISTS scheduled_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_jid TEXT NOT NULL,
    group_name TEXT,
    message TEXT NOT NULL,
    send_at INTEGER NOT NULL,           -- epoch ms
    status TEXT NOT NULL DEFAULT 'pending', -- pending | sending | sent | failed | cancelled
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER,            -- epoch ms, for retries
    error TEXT,
    created_at INTEGER NOT NULL,
    sent_at INTEGER,
    repeat_rule TEXT NOT NULL DEFAULT 'none', -- none | weekly | monthly
    series_id INTEGER                   -- groups occurrences of the same recurring message
  );
  CREATE INDEX IF NOT EXISTS idx_sched_status_send_at ON scheduled_messages(status, send_at);

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
`)

// Migrate databases created before repeat support existed.
for (const stmt of [
  `ALTER TABLE scheduled_messages ADD COLUMN repeat_rule TEXT NOT NULL DEFAULT 'none'`,
  `ALTER TABLE scheduled_messages ADD COLUMN series_id INTEGER`,
]) {
  try { db.exec(stmt) } catch (err) { if (!/duplicate column/i.test(err.message)) throw err }
}

// Any row stuck in 'sending' from a previous crash goes back to pending.
db.prepare(`UPDATE scheduled_messages SET status = 'pending' WHERE status = 'sending'`).run()

const stmts = {
  insert: db.prepare(`
    INSERT INTO scheduled_messages (group_jid, group_name, message, send_at, repeat_rule, series_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  setSeriesId: db.prepare(`UPDATE scheduled_messages SET series_id = ? WHERE id = ?`),
  list: db.prepare(`SELECT * FROM scheduled_messages ORDER BY send_at DESC, id DESC LIMIT ?`),
  get: db.prepare(`SELECT * FROM scheduled_messages WHERE id = ?`),
  due: db.prepare(`
    SELECT * FROM scheduled_messages
    WHERE status = 'pending' AND send_at <= ? AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
    ORDER BY send_at ASC
  `),
  claim: db.prepare(`UPDATE scheduled_messages SET status = 'sending' WHERE id = ? AND status = 'pending'`),
  markSent: db.prepare(`UPDATE scheduled_messages SET status = 'sent', sent_at = ?, error = NULL WHERE id = ?`),
  markRetry: db.prepare(`
    UPDATE scheduled_messages SET status = 'pending', attempts = ?, next_attempt_at = ?, error = ? WHERE id = ?
  `),
  markFailed: db.prepare(`UPDATE scheduled_messages SET status = 'failed', attempts = ?, error = ? WHERE id = ?`),
  cancel: db.prepare(`UPDATE scheduled_messages SET status = 'cancelled' WHERE id = ? AND status = 'pending'`),
  delete: db.prepare(`DELETE FROM scheduled_messages WHERE id = ? AND status != 'sending'`),

  upsertUser: db.prepare(`
    INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash
  `),
  getUserByEmail: db.prepare(`SELECT * FROM users WHERE email = ?`),

  insertSession: db.prepare(`
    INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)
  `),
  getSession: db.prepare(`
    SELECT sessions.token, sessions.expires_at, users.id AS user_id, users.email
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ? AND sessions.expires_at > ?
  `),
  deleteSession: db.prepare(`DELETE FROM sessions WHERE token = ?`),
  deleteExpiredSessions: db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`),
}

export const messages = {
  create({ groupJid, groupName, message, sendAt, repeat = 'none', seriesId = null }) {
    const r = stmts.insert.run(groupJid, groupName ?? null, message, sendAt, repeat, seriesId, Date.now())
    const id = Number(r.lastInsertRowid)
    // First occurrence of a new series: use its own id to identify the series.
    if (repeat !== 'none' && seriesId == null) stmts.setSeriesId.run(id, id)
    return stmts.get.get(id)
  },
  list(limit = 200) {
    return stmts.list.all(limit)
  },
  get(id) {
    return stmts.get.get(id)
  },
  due(now = Date.now()) {
    return stmts.due.all(now, now)
  },
  claim(id) {
    return stmts.claim.run(id).changes === 1
  },
  markSent(id) {
    stmts.markSent.run(Date.now(), id)
  },
  markRetry(id, attempts, nextAttemptAt, error) {
    stmts.markRetry.run(attempts, nextAttemptAt, error, id)
  },
  markFailed(id, attempts, error) {
    stmts.markFailed.run(attempts, error, id)
  },
  cancel(id) {
    return stmts.cancel.run(id).changes === 1
  },
  delete(id) {
    return stmts.delete.run(id).changes === 1
  },
}

export const users = {
  upsert({ email, passwordHash }) {
    stmts.upsertUser.run(email, passwordHash, Date.now())
    return stmts.getUserByEmail.get(email)
  },
  getByEmail(email) {
    return stmts.getUserByEmail.get(email)
  },
}

export const sessions = {
  insert(token, userId, createdAt, expiresAt) {
    stmts.insertSession.run(token, userId, createdAt, expiresAt)
  },
  get(token) {
    return stmts.getSession.get(token, Date.now()) ?? null
  },
  delete(token) {
    stmts.deleteSession.run(token)
  },
  pruneExpired() {
    stmts.deleteExpiredSessions.run(Date.now())
  },
}

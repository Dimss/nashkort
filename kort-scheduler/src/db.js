import { config, normalizeEmail } from './config.js'
import { openDatabase } from './migrations.js'

export const database = openDatabase(config.dbPath, { adminEmail: config.adminEmail || null, backupPath: config.backupPath })
const db = database

// Any row stuck in 'sending' from a previous crash goes back to pending.
db.prepare(`UPDATE scheduled_messages SET status = 'pending' WHERE status = 'sending'`).run()

// Runs fn inside one BEGIN IMMEDIATE transaction. Synchronous only: never await inside.
export function transaction(fn) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

const stmts = {
  insert: db.prepare(`
    INSERT INTO scheduled_messages (owner_id, group_jid, group_name, message, send_at, repeat_rule, series_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  setSeriesId: db.prepare(`UPDATE scheduled_messages SET series_id = ? WHERE id = ?`),
  list: db.prepare(`SELECT * FROM scheduled_messages WHERE owner_id = ? ORDER BY send_at DESC, id DESC LIMIT ?`),
  getOwned: db.prepare(`SELECT * FROM scheduled_messages WHERE id = ? AND owner_id = ?`),
  getById: db.prepare(`SELECT * FROM scheduled_messages WHERE id = ?`),
  due: db.prepare(`
    SELECT m.* FROM scheduled_messages m
    JOIN users u ON u.id = m.owner_id
    WHERE m.status = 'pending' AND u.state = 'approved'
      AND m.send_at <= ? AND (m.next_attempt_at IS NULL OR m.next_attempt_at <= ?)
    ORDER BY m.send_at ASC
  `),
  claim: db.prepare(`
    UPDATE scheduled_messages SET status = 'sending'
    WHERE id = ? AND status = 'pending'
      AND EXISTS (SELECT 1 FROM users WHERE users.id = scheduled_messages.owner_id AND users.state = 'approved')
  `),
  markSent: db.prepare(`UPDATE scheduled_messages SET status = 'sent', sent_at = ?, error = NULL WHERE id = ?`),
  markRetry: db.prepare(`
    UPDATE scheduled_messages SET status = 'pending', attempts = ?, next_attempt_at = ?, error = ? WHERE id = ?
  `),
  markFailed: db.prepare(`UPDATE scheduled_messages SET status = 'failed', attempts = ?, error = ? WHERE id = ?`),
  markMissed: db.prepare(`UPDATE scheduled_messages SET status = 'missed' WHERE id = ? AND status = 'pending'`),
  cancel: db.prepare(`UPDATE scheduled_messages SET status = 'cancelled' WHERE id = ? AND owner_id = ? AND status = 'pending'`),
  delete: db.prepare(`DELETE FROM scheduled_messages WHERE id = ? AND owner_id = ? AND status != 'sending'`),
  seriesHasPending: db.prepare(`SELECT 1 FROM scheduled_messages WHERE series_id = ? AND status IN ('pending', 'sending') LIMIT 1`),
  pastDueForOwner: db.prepare(`SELECT * FROM scheduled_messages WHERE owner_id = ? AND status = 'pending' AND send_at < ? ORDER BY send_at ASC`),
  countOwnerless: db.prepare(`SELECT count(*) AS n FROM scheduled_messages WHERE owner_id IS NULL`),

  userById: db.prepare(`SELECT * FROM users WHERE id = ?`),
  userByEmail: db.prepare(`SELECT * FROM users WHERE email = ?`),
  userBySub: db.prepare(`SELECT * FROM users WHERE auth0_sub = ?`),
  insertPending: db.prepare(`INSERT INTO users (email, auth0_sub, state, created_at, last_sign_in_at) VALUES (?, ?, 'pending', ?, ?)`),
  adoptByEmail: db.prepare(`UPDATE users SET auth0_sub = ? WHERE email = ? AND auth0_sub IS NULL`),
  touchSignIn: db.prepare(`UPDATE users SET last_sign_in_at = ?, email = ? WHERE id = ?`),
  setState: db.prepare(`UPDATE users SET state = ? WHERE id = ?`),
  upsertAdmin: db.prepare(`INSERT INTO users (email, state, created_at) VALUES (?, 'approved', ?) ON CONFLICT(email) DO UPDATE SET state = 'approved'`),
  listUsers: db.prepare(`
    SELECT id, email, state, created_at, last_sign_in_at FROM users
    ORDER BY CASE state WHEN 'pending' THEN 0 ELSE 1 END, created_at ASC, id ASC
  `),

  insertSession: db.prepare(`INSERT INTO sessions (token_hash, user_id, sid, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`),
  getSession: db.prepare(`
    SELECT s.token_hash, s.sid, s.expires_at, u.id AS user_id, u.email, u.state
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `),
  deleteSession: db.prepare(`DELETE FROM sessions WHERE token_hash = ?`),
  deleteSessionsForUser: db.prepare(`DELETE FROM sessions WHERE user_id = ?`),
  deleteExpiredSessions: db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`),
}

function requireOwner(ownerId) {
  if (!Number.isInteger(ownerId) || ownerId <= 0) throw new TypeError('a message needs an integer owner id')
  return ownerId
}

export const messages = {
  create({ ownerId, groupJid, groupName, message, sendAt, repeat = 'none', seriesId = null }) {
    requireOwner(ownerId)
    const r = stmts.insert.run(ownerId, groupJid, groupName ?? null, message, sendAt, repeat, seriesId, Date.now())
    const id = Number(r.lastInsertRowid)
    // First occurrence of a new series: use its own id to identify the series.
    if (repeat !== 'none' && seriesId == null) stmts.setSeriesId.run(id, id)
    return stmts.getById.get(id)
  },
  list(ownerId, limit = 200) {
    return stmts.list.all(requireOwner(ownerId), limit)
  },
  get(id, ownerId) {
    return stmts.getOwned.get(id, requireOwner(ownerId))
  },
  // Scheduler-internal lookup by id, not scoped to a caller.
  getById(id) {
    return stmts.getById.get(id)
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
  markMissed(id) {
    return stmts.markMissed.run(id).changes === 1
  },
  cancel(id, ownerId) {
    return stmts.cancel.run(id, requireOwner(ownerId)).changes === 1
  },
  delete(id, ownerId) {
    return stmts.delete.run(id, requireOwner(ownerId)).changes === 1
  },
  seriesHasPending(seriesId) {
    return !!stmts.seriesHasPending.get(seriesId)
  },
  pastDueForOwner(ownerId, now = Date.now()) {
    return stmts.pastDueForOwner.all(requireOwner(ownerId), now)
  },
}

export const users = {
  get(id) {
    return stmts.userById.get(id)
  },
  findByEmail(email) {
    return stmts.userByEmail.get(normalizeEmail(email))
  },
  findBySub(sub) {
    return stmts.userBySub.get(sub)
  },
  insertPending({ email, sub }) {
    const now = Date.now()
    const r = stmts.insertPending.run(normalizeEmail(email), sub, now, now)
    return stmts.userById.get(Number(r.lastInsertRowid))
  },
  // Attaches a subject to a row that has none yet (legacy or bootstrapped rows). Undefined when no such row.
  adoptByEmail(email, sub) {
    if (stmts.adoptByEmail.run(sub, normalizeEmail(email)).changes !== 1) return undefined
    return stmts.userBySub.get(sub)
  },
  touchSignIn(id, email, now = Date.now()) {
    stmts.touchSignIn.run(now, normalizeEmail(email), id)
  },
  setState(id, state) {
    return stmts.setState.run(state, id).changes === 1
  },
  upsertAdmin(email) {
    const normalized = normalizeEmail(email)
    stmts.upsertAdmin.run(normalized, Date.now())
    return stmts.userByEmail.get(normalized)
  },
  list() {
    return stmts.listUsers.all()
  },
}

export const sessions = {
  insert(tokenHash, userId, sid, createdAt, expiresAt) {
    stmts.insertSession.run(tokenHash, userId, sid ?? null, createdAt, expiresAt)
  },
  get(tokenHash, now = Date.now()) {
    return stmts.getSession.get(tokenHash, now) ?? null
  },
  delete(tokenHash) {
    stmts.deleteSession.run(tokenHash)
  },
  deleteForUser(userId) {
    return stmts.deleteSessionsForUser.run(userId).changes
  },
  pruneExpired(now = Date.now()) {
    stmts.deleteExpiredSessions.run(now)
  },
}

export const integrity = {
  countOwnerless() {
    return stmts.countOwnerless.get().n
  },
}

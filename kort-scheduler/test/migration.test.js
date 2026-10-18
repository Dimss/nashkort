import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { freshData } from './helpers/tempdata.js'
import { createLegacyDb, columns, userVersion, LEGACY_EMAIL } from './helpers/legacy-db.js'
import { openDatabase, cutoverStatements } from '../src/migrations.js'

process.env.ADMIN_EMAIL = LEGACY_EMAIL
const BACKUP = 'scheduler.pre-auth0.db'

// db.js can be imported once per process, so only this test goes through it;
// the others drive the same migration entry point on their own files.
test('a fresh database is created at version 1 with the new shape', async () => {
  const env = await freshData()
  try {
    await env.load('db.js')
    const p = join(env.dir, 'scheduler.db')
    assert.equal(userVersion(p), 1)
    assert.ok(!columns(p, 'users').includes('password_hash'))
    assert.ok(columns(p, 'users').includes('auth0_sub'))
    assert.ok(columns(p, 'scheduled_messages').includes('owner_id'))
    const db = new DatabaseSync(p, { readOnly: true })
    const idx = db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='users' AND sql LIKE '%UNIQUE%auth0_sub%'`).all()
    db.close()
    assert.equal(idx.length, 1)
  } finally { env.cleanup() }
})

test('a legacy database migrates once: rows kept, messages owned by the approved admin, backup written', async () => {
  const env = await freshData()
  try {
    createLegacyDb(env.dir, { messages: 3 })
    const p = join(env.dir, 'scheduler.db')
    assert.equal(userVersion(p), 0)
    const db = openDatabase(p, { adminEmail: LEGACY_EMAIL, backupPath: join(env.dir, BACKUP) })
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1)
    assert.ok(!columns(p, 'users').includes('password_hash'))
    const admin = db.prepare('SELECT * FROM users WHERE email = ?').get(LEGACY_EMAIL)
    assert.equal(admin.state, 'approved')
    assert.equal(db.prepare('SELECT count(*) AS n FROM scheduled_messages WHERE owner_id = ?').get(admin.id).n, 3)
    assert.equal(db.prepare('SELECT count(*) AS n FROM scheduled_messages WHERE owner_id IS NULL').get().n, 0)
    assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n, 1)
    assert.ok(columns(p, 'sessions').includes('token_hash'))
    assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0)
    db.close()
    // AE8: the backup is self-contained and still carries the old column
    const backup = join(env.dir, BACKUP)
    assert.ok(existsSync(backup))
    assert.ok(columns(backup, 'users').includes('password_hash'))
    const b = new DatabaseSync(backup, { readOnly: true })
    assert.equal(b.prepare('SELECT count(*) AS n FROM scheduled_messages').get().n, 3)
    b.close()
  } finally { env.cleanup() }
})

test('the cutover statements are atomic: a rollback before commit leaves the legacy schema intact, and the next run migrates', async () => {
  const env = await freshData()
  try {
    createLegacyDb(env.dir, { messages: 2 })
    const p = join(env.dir, 'scheduler.db')
    const db = new DatabaseSync(p)
    db.exec('BEGIN IMMEDIATE')
    for (const { sql, params = [] } of cutoverStatements({ adminEmail: LEGACY_EMAIL, now: Date.now() })) db.prepare(sql).run(...params)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1)
    db.exec('ROLLBACK')
    db.close()
    assert.equal(userVersion(p), 0)
    assert.ok(columns(p, 'users').includes('password_hash'))
    assert.ok(!columns(p, 'scheduled_messages').includes('owner_id'))
    const db2 = openDatabase(p, { adminEmail: LEGACY_EMAIL, backupPath: join(env.dir, BACKUP) })
    assert.equal(db2.prepare('PRAGMA user_version').get().user_version, 1)
    assert.equal(db2.prepare('SELECT count(*) AS n FROM scheduled_messages WHERE owner_id IS NOT NULL').get().n, 2)
    db2.close()
  } finally { env.cleanup() }
})

test('a second start changes nothing: version stays 1, one admin, one backup', async () => {
  const env = await freshData()
  try {
    createLegacyDb(env.dir, { messages: 1 })
    const p = join(env.dir, 'scheduler.db')
    openDatabase(p, { adminEmail: LEGACY_EMAIL, backupPath: join(env.dir, BACKUP) }).close()
    const backupMtime = statSync(join(env.dir, BACKUP)).mtimeMs
    const db2 = openDatabase(p, { adminEmail: LEGACY_EMAIL, backupPath: join(env.dir, BACKUP) })
    assert.equal(db2.prepare('PRAGMA user_version').get().user_version, 1)
    assert.equal(db2.prepare('SELECT count(*) AS n FROM users').get().n, 1)
    db2.close()
    assert.equal(statSync(join(env.dir, BACKUP)).mtimeMs, backupMtime)
  } finally { env.cleanup() }
})

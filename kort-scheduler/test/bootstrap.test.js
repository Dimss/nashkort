import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { freshData } from './helpers/tempdata.js'
import { createLegacyDb, LEGACY_EMAIL } from './helpers/legacy-db.js'

const ADMIN = 'Admin@Example.com '

test('bootstrap with a new admin email creates the approved admin and leaves the legacy row and its messages alone', async () => {
  process.env.ADMIN_EMAIL = ADMIN
  const env = await freshData()
  try {
    createLegacyDb(env.dir, { messages: 2 })
    const { users, messages } = await env.load('db.js')
    const { bootstrap } = await env.load('bootstrap.js')
    const { admin } = bootstrap()
    assert.equal(admin.email, 'admin@example.com')
    assert.equal(admin.state, 'approved')
    const legacy = users.findByEmail(LEGACY_EMAIL)
    // the cutover assigned ownerless messages to the configured admin at that time
    assert.equal(messages.list(admin.id).length, 2)
    assert.equal(messages.list(legacy.id).length, 0)
    // a later change of ADMIN_EMAIL moves the role, never the data
    process.env.ADMIN_EMAIL = LEGACY_EMAIL
    const { bootstrap: again } = await env.load('bootstrap.js')
    const second = again().admin
    assert.equal(second.id, legacy.id)
    assert.equal(messages.list(admin.id).length, 2)
    assert.equal(users.get(admin.id).state, 'approved')
  } finally { env.cleanup() }
})

test('a disabled account that becomes the configured admin is enabled through the missed sweep, not a bare approve', async () => {
  process.env.ADMIN_EMAIL = 'first@example.com'
  const env = await freshData()
  try {
    const { users, messages, database } = await env.load('db.js')
    const { bootstrap } = await env.load('bootstrap.js')
    bootstrap()
    const paused = users.insertPending({ email: 'paused@example.com', sub: 'auth0|paused' })
    users.setState(paused.id, 'approved')
    const overdue = messages.create({ ownerId: paused.id, groupJid: 'g@g.us', groupName: 'G', message: 'late', sendAt: Date.now() - 5 * 60_000 })
    const weekly = messages.create({ ownerId: paused.id, groupJid: 'g@g.us', groupName: 'G', message: 'weekly', sendAt: Date.now() - 16 * 24 * 3600_000, repeat: 'weekly' })
    users.setState(paused.id, 'disabled')
    process.env.ADMIN_EMAIL = 'paused@example.com'
    const { bootstrap: again } = await env.load('bootstrap.js')
    const { admin } = again()
    assert.equal(admin.id, paused.id)
    assert.equal(admin.state, 'approved')
    assert.equal(messages.getById(overdue.id).status, 'missed')
    assert.equal(messages.getById(weekly.id).status, 'missed')
    const pending = database.prepare("SELECT send_at FROM scheduled_messages WHERE owner_id = ? AND status = 'pending'").all(paused.id)
    assert.equal(pending.length, 1, 'the weekly series continues with one future row')
    assert.ok(pending[0].send_at > Date.now())
    assert.equal(users.findByEmail('first@example.com').state, 'approved', 'the previous admin keeps an ordinary approved account')
  } finally { env.cleanup() }
})

test('start-up without ADMIN_EMAIL exits non-zero naming the variable and no value', async () => {
  const env = await freshData()
  try {
    const envVars = { ...process.env, DATA_DIR: env.dir, BASE_URL: 'https://x.example', AUTH0_DOMAIN: 'd', AUTH0_CLIENT_ID: 'id', AUTH0_CLIENT_SECRET: 'sekrit-value' }
    delete envVars.ADMIN_EMAIL
    const r = spawnSync(process.execPath, ['src/index.js'], { env: envVars, timeout: 15000, encoding: 'utf8' })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /ADMIN_EMAIL/)
    assert.doesNotMatch(r.stderr, /sekrit-value/)
  } finally { env.cleanup() }
})

test('authDirFor accepts only positive integers', async () => {
  const env = await freshData()
  try {
    const { config } = await env.load('config.js')
    assert.match(config.authDirFor(7), /wa[\\/]7$/)
    for (const bad of ['7', 0, -1, 1.5, null, undefined]) assert.throws(() => config.authDirFor(bad))
  } finally { env.cleanup() }
})

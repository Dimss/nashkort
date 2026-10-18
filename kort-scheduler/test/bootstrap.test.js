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

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { freshData } from './helpers/tempdata.js'

process.env.ADMIN_EMAIL = 'folders@example.com'

test('legacy credential folder moves once by rename; an existing target is left alone; an empty legacy folder is ignored', async () => {
  const env = await freshData()
  try {
    const { config } = await env.load('config.js')
    const { bootstrap } = await env.load('bootstrap.js')
    // empty legacy folder: no-op
    mkdirSync(join(env.dir, 'auth'))
    let r = bootstrap()
    assert.equal(r.movedLegacyAuth, false)
    assert.ok(!existsSync(config.authDirFor(r.admin.id)))
    // legacy folder with credentials and no target: moved in one rename
    writeFileSync(join(env.dir, 'auth', 'creds.json'), '{}')
    writeFileSync(join(env.dir, 'auth', 'pre-key-1.json'), '{}')
    r = bootstrap()
    assert.equal(r.movedLegacyAuth, true)
    const target = config.authDirFor(r.admin.id)
    assert.deepEqual(readdirSync(target).sort(), ['creds.json', 'pre-key-1.json'])
    assert.ok(!existsSync(join(env.dir, 'auth')))
    // legacy and target both present: nothing moves
    mkdirSync(join(env.dir, 'auth'))
    writeFileSync(join(env.dir, 'auth', 'creds.json'), '{"other":true}')
    r = bootstrap()
    assert.equal(r.movedLegacyAuth, false)
    assert.ok(existsSync(join(env.dir, 'auth', 'creds.json')))
    assert.deepEqual(readdirSync(target).sort(), ['creds.json', 'pre-key-1.json'])
    // bootstrap again changes nothing
    r = bootstrap()
    assert.equal(r.movedLegacyAuth, false)
  } finally { env.cleanup() }
})


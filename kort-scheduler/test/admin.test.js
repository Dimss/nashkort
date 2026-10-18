import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { freshData } from './helpers/tempdata.js'
import { createFakeIssuer, startApp, request, signIn } from './helpers/fake-issuer.js'

const ADMIN = 'admin@example.com'
process.env.ADMIN_EMAIL = ADMIN
process.env.BASE_URL = 'http://app.local'
process.env.AUTH0_DOMAIN = 'fake-issuer.example'
process.env.AUTH0_CLIENT_ID = 'test-client'
process.env.AUTH0_CLIENT_SECRET = 'test-secret'

let env, issuer, srv, users, sessions, messages, database, config, admin
const calls = { ensure: [], stop: [] }
const running = new Set()
const registry = {
  events: new EventEmitter(),
  get(id) { return running.has(id) ? { connected: true } : undefined },
  ensure(id) {
    // the start must be requested only after the enable transaction committed
    calls.ensure.push({ id, inTransaction: database.isTransaction, state: users.get(id).state, pastDue: messages.pastDueForOwner(id).length })
    running.add(id)
  },
  async stop(id) { calls.stop.push(id); return running.delete(id) },
}

const verified = (sub, email) => ({ sub, email, email_verified: true })
const asUser = (s) => ({ cookies: { [s.name]: s.value } })
const post = (path, s) => request(srv.origin, path, { method: 'POST', ...asUser(s) })

before(async () => {
  env = await freshData()
  issuer = createFakeIssuer()
  ;({ users, sessions, messages, database } = await env.load('db.js'))
  ;({ config } = await env.load('config.js'))
  const { bootstrap } = await env.load('bootstrap.js')
  ;({ admin } = bootstrap())
  const { createApp } = await env.load('server.js')
  const { createAccounts } = await env.load('accounts.js')
  srv = await startApp(createApp({ fetch: issuer.fetch, accounts: createAccounts({ registry }) }))
})
after(async () => { await srv?.close(); env?.cleanup() })

test('a non-admin approved user and a disabled row with the admin email get 403 on admin routes', async () => {
  const { session } = await signIn(srv.origin, issuer, verified('auth0|plain', 'plain@example.com'))
  users.setState(users.findBySub('auth0|plain').id, 'approved')
  const r = await request(srv.origin, '/api/admin/users', asUser(session))
  assert.equal(r.status, 403)
  // the admin signs in (adopts the bootstrapped row), then is disabled directly in the database
  const { session: adminSession } = await signIn(srv.origin, issuer, verified('auth0|admin', ADMIN))
  assert.equal(users.findBySub('auth0|admin').id, admin.id)
  users.setState(admin.id, 'disabled')
  const d = await request(srv.origin, '/api/admin/users', asUser(adminSession))
  assert.equal(d.status, 403)
  users.setState(admin.id, 'approved')
  const ok = await request(srv.origin, '/api/admin/users', asUser(adminSession))
  assert.equal(ok.status, 200)
})

test('the list carries only account fields, pending first', async () => {
  const { session } = await signIn(srv.origin, issuer, verified('auth0|admin', ADMIN))
  await signIn(srv.origin, issuer, verified('auth0|newbie', 'newbie@example.com'))
  const r = await request(srv.origin, '/api/admin/users', asUser(session))
  assert.equal(r.status, 200)
  const rows = r.json()
  assert.equal(rows[0].email, 'newbie@example.com')
  assert.equal(rows[0].state, 'pending')
  for (const row of rows) assert.deepEqual(Object.keys(row).sort(), ['created_at', 'email', 'id', 'last_sign_in_at', 'state'])
})

test('approve moves pending to approved and starts no client; approve on a disabled account is refused', async () => {
  const { session } = await signIn(srv.origin, issuer, verified('auth0|admin', ADMIN))
  await signIn(srv.origin, issuer, verified('auth0|p1', 'p1@example.com'))
  const u = users.findBySub('auth0|p1')
  calls.ensure.length = 0
  const r = await post(`/api/admin/users/${u.id}/approve`, session)
  assert.equal(r.status, 200)
  assert.equal(r.json().state, 'approved')
  assert.equal(users.get(u.id).state, 'approved')
  assert.equal(calls.ensure.length, 0)
  users.setState(u.id, 'disabled')
  const again = await post(`/api/admin/users/${u.id}/approve`, session)
  assert.equal(again.status, 409)
  const missing = await post(`/api/admin/users/99999/approve`, session)
  assert.equal(missing.status, 404)
})

test('AE6: the admin cannot disable or reject their own account', async () => {
  const { session } = await signIn(srv.origin, issuer, verified('auth0|admin', ADMIN))
  for (const action of ['disable', 'reject']) {
    const r = await post(`/api/admin/users/${admin.id}/${action}`, session)
    assert.equal(r.status, 409)
  }
  assert.equal(users.get(admin.id).state, 'approved')
})

test('AE4: disable deletes every session of the user with the state change and stops a running client with credentials kept', async () => {
  const { session: adminSession } = await signIn(srv.origin, issuer, verified('auth0|admin', ADMIN))
  const { session: s1 } = await signIn(srv.origin, issuer, verified('auth0|d1', 'd1@example.com'))
  const u = users.findBySub('auth0|d1')
  users.setState(u.id, 'approved')
  const { session: s2 } = await signIn(srv.origin, issuer, verified('auth0|d1', 'd1@example.com'))
  assert.equal(database.prepare('SELECT count(*) AS n FROM sessions WHERE user_id = ?').get(u.id).n, 2)
  mkdirSync(config.authDirFor(u.id), { recursive: true }); writeFileSync(join(config.authDirFor(u.id), 'creds.json'), '{}')
  running.add(u.id); calls.stop.length = 0
  const r = await post(`/api/admin/users/${u.id}/disable`, adminSession)
  assert.equal(r.status, 200)
  assert.equal(users.get(u.id).state, 'disabled')
  assert.equal(database.prepare('SELECT count(*) AS n FROM sessions WHERE user_id = ?').get(u.id).n, 0)
  assert.deepEqual(calls.stop, [u.id])
  assert.ok(existsSync(join(config.authDirFor(u.id), 'creds.json')))
  for (const s of [s1, s2]) assert.equal((await request(srv.origin, '/api/messages', asUser(s))).status, 401)
})

test('AE3: enable marks the past-due row missed inside the state transaction and requests the client start only after commit', async () => {
  const { session: adminSession } = await signIn(srv.origin, issuer, verified('auth0|admin', ADMIN))
  await signIn(srv.origin, issuer, verified('auth0|e1', 'e1@example.com'))
  const u = users.findBySub('auth0|e1')
  users.setState(u.id, 'approved')
  const past = messages.create({ ownerId: u.id, groupJid: 'g@g.us', message: 'late', sendAt: Date.now() - 5 * 60_000 })
  const tomorrow = messages.create({ ownerId: u.id, groupJid: 'g@g.us', message: 'tomorrow', sendAt: Date.now() + 86_400_000 })
  users.setState(u.id, 'disabled')
  calls.ensure.length = 0
  const r = await post(`/api/admin/users/${u.id}/enable`, adminSession)
  assert.equal(r.status, 200)
  assert.equal(users.get(u.id).state, 'approved')
  assert.equal(messages.get(past.id, u.id).status, 'missed')
  assert.equal(messages.get(tomorrow.id, u.id).status, 'pending')
  assert.equal(calls.ensure.length, 1)
  assert.equal(calls.ensure[0].inTransaction, false)
  assert.equal(calls.ensure[0].state, 'approved')
  assert.equal(calls.ensure[0].pastDue, 0)
})

test('reject moves pending to disabled, ends its sessions, and the person stays out', async () => {
  const { session: adminSession } = await signIn(srv.origin, issuer, verified('auth0|admin', ADMIN))
  const { session } = await signIn(srv.origin, issuer, verified('auth0|r1', 'r1@example.com'))
  const u = users.findBySub('auth0|r1')
  const r = await post(`/api/admin/users/${u.id}/reject`, adminSession)
  assert.equal(r.status, 200)
  assert.equal(users.get(u.id).state, 'disabled')
  assert.equal((await request(srv.origin, '/api/me', asUser(session))).status, 401)
  const again = await post(`/api/admin/users/${u.id}/reject`, adminSession)
  assert.equal(again.status, 409)
})

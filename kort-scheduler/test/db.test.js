import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { freshData } from './helpers/tempdata.js'

let env, users, messages, sessions
const HOUR = 3600_000
const mk = (ownerId, over = {}) => messages.create({ ownerId, groupJid: 'g@g.us', groupName: 'G', message: 'm', sendAt: Date.now() - HOUR, ...over })

before(async () => {
  env = await freshData()
  ;({ users, messages, sessions } = await env.load('db.js'))
})
after(() => env.cleanup())

test('create refuses a missing or non-integer owner', () => {
  assert.throws(() => messages.create({ groupJid: 'g@g.us', message: 'm', sendAt: Date.now() }))
  assert.throws(() => messages.create({ ownerId: '1', groupJid: 'g@g.us', message: 'm', sendAt: Date.now() }))
})

test('due returns only rows whose owner is approved; list and get are owner-scoped', () => {
  const a = users.insertPending({ email: 'a@x', sub: 'auth0|a' }); users.setState(a.id, 'approved')
  const b = users.insertPending({ email: 'b@x', sub: 'auth0|b' }); users.setState(b.id, 'approved')
  const pending = users.insertPending({ email: 'p@x', sub: 'auth0|p' })
  const disabled = users.insertPending({ email: 'd@x', sub: 'auth0|d' }); users.setState(disabled.id, 'disabled')
  const ra = mk(a.id), rb = mk(b.id), rp = mk(pending.id), rd = mk(disabled.id)
  const due = messages.due(Date.now()).map((r) => r.id)
  assert.ok(due.includes(ra.id) && due.includes(rb.id))
  assert.ok(!due.includes(rp.id) && !due.includes(rd.id))
  assert.deepEqual(messages.list(a.id).map((r) => r.id), [ra.id])
  assert.equal(messages.get(rb.id, a.id), undefined)
  assert.equal(messages.get(rb.id, b.id).id, rb.id)
  assert.equal(messages.cancel(rb.id, a.id), false)
  assert.equal(messages.cancel(rb.id, b.id), true)
})

test('claim fails for a pending row whose owner was disabled after it was selected', () => {
  const u = users.insertPending({ email: 'c@x', sub: 'auth0|c' }); users.setState(u.id, 'approved')
  const r = mk(u.id)
  const [row] = messages.due(Date.now()).filter((x) => x.id === r.id)
  users.setState(u.id, 'disabled')
  assert.equal(messages.claim(row.id), false)
  assert.equal(messages.get(r.id, u.id).status, 'pending')
})

test('users: find by subject, adopt a subject-less row by email once, refuse a second subject for the same email', () => {
  const legacy = users.upsertAdmin('Legacy@X ')
  assert.equal(legacy.email, 'legacy@x')
  assert.equal(users.findBySub('auth0|L'), undefined)
  const adopted = users.adoptByEmail('legacy@x', 'auth0|L')
  assert.equal(adopted.id, legacy.id)
  assert.equal(users.findBySub('auth0|L').id, legacy.id)
  assert.equal(users.adoptByEmail('legacy@x', 'auth0|other'), undefined)
  assert.throws(() => users.insertPending({ email: 'legacy@x', sub: 'auth0|other' }))
})

test('sessions are stored by token hash, end on delete or expiry, and vanish when the user\'s sessions are deleted', () => {
  const u = users.insertPending({ email: 's@x', sub: 'auth0|s' }); users.setState(u.id, 'approved')
  const now = Date.now()
  sessions.insert('h1', u.id, 'sid-1', now, now + HOUR)
  sessions.insert('h2', u.id, 'sid-2', now, now - 1)
  assert.equal(sessions.get('h1', now).user_id, u.id)
  assert.equal(sessions.get('h1', now).state, 'approved')
  assert.equal(sessions.get('h2', now), null)
  sessions.deleteForUser(u.id)
  assert.equal(sessions.get('h1', now), null)
})

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { freshData } from './helpers/tempdata.js'
import { nextOccurrence } from '../src/recurrence.js'
import { zonedTime } from '../public/template.js'

let env, config, db, messages, users, database, transaction, createScheduler, sweepMissed

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const WEEK = 7 * DAY
// Wall-clock time in the app's default zone, which recurrence counts in.
const local = (year, month, day, hour = 10) => zonedTime({ year, month, day, hour }, 'Asia/Jerusalem')
const settle = () => new Promise((r) => setTimeout(r, 20))
// `n` weekly occurrences after `t` in the default app zone (a week is not always 7 x 24 h).
const weeksLater = (t, n = 1) => { for (let i = 0; i < n; i++) t = nextOccurrence(t, 'weekly', t, 'Asia/Jerusalem'); return t }

let seq = 0
function approvedUser() {
  const u = users.insertPending({ email: `u${++seq}@x`, sub: `auth0|u${seq}` })
  users.setState(u.id, 'approved')
  return u
}

const row = (ownerId, over = {}) => messages.create({
  ownerId, groupJid: 'g@g.us', groupName: 'Court', message: 'hi', sendAt: Date.now() - MIN, ...over,
})

// A registry double: `get(userId)` hands back whatever client the test registered.
function fakeRegistry() {
  const map = new Map()
  const events = new EventEmitter()
  return {
    events,
    ensured: [],
    get(userId) { return map.get(userId) },
    ensure(userId) { this.ensured.push(userId) },
    connect(userId, sendText = async () => {}) {
      const sent = []
      const client = { connected: true, sent, sendText: async (jid, text) => { sent.push([jid, text]); return sendText(jid, text) } }
      map.set(userId, client)
      return client
    },
    disconnect(userId) {
      const client = { connected: false, sent: [], sendText: async () => { throw new Error('not connected') } }
      map.set(userId, client)
      return client
    },
  }
}

function makeScheduler(registry, over = {}) {
  return createScheduler({ registry, config: { ...config, tickMs: HOUR, retryDelayMs: 0, maxAttempts: 2, ...over } })
}

const seriesRows = (seriesId) => database.prepare('SELECT * FROM scheduled_messages WHERE series_id = ? ORDER BY send_at').all(seriesId)
const ownerRows = (ownerId) => database.prepare('SELECT * FROM scheduled_messages WHERE owner_id = ? ORDER BY send_at').all(ownerId)

before(async () => {
  env = await freshData()
  ;({ config } = await env.load('config.js'))
  db = await env.load('db.js')
  ;({ messages, users, database, transaction } = db)
  ;({ createScheduler, sweepMissed } = await env.load('scheduler.js'))
})
after(() => env.cleanup())

// --- tick -----------------------------------------------------------------

test('a due row whose owner is disconnected stays pending with zero attempts across several ticks', async () => {
  const u = approvedUser()
  const registry = fakeRegistry()
  const client = registry.disconnect(u.id)
  const m = row(u.id)
  const s = makeScheduler(registry)
  await s.tick(); await s.tick(); await s.tick()
  const after = messages.getById(m.id)
  assert.equal(after.status, 'pending')
  assert.equal(after.attempts, 0)
  assert.equal(client.sent.length, 0)
})

test('a due row whose owner has saved credentials but no client asks the registry to start one and stays pending', async () => {
  const u = approvedUser()
  mkdirSync(config.authDirFor(u.id), { recursive: true }); writeFileSync(join(config.authDirFor(u.id), 'creds.json'), '{}')
  const registry = fakeRegistry()
  const m = row(u.id)
  const s = makeScheduler(registry)
  await s.tick(); await s.tick()
  assert.deepEqual(registry.ensured.filter((id) => id === u.id), [u.id, u.id], 'asked once per tick')
  assert.equal(messages.getById(m.id).status, 'pending')
  assert.equal(messages.getById(m.id).attempts, 0)
})

test('a due row whose owner has neither credentials nor a client is left alone', async () => {
  const u = approvedUser()
  const registry = fakeRegistry()
  const m = row(u.id)
  await makeScheduler(registry).tick()
  assert.ok(!registry.ensured.includes(u.id), 'no start requested for an owner with nothing to link')
  assert.equal(messages.getById(m.id).status, 'pending')
})

test('a due row for a connected owner goes out through that owner\'s client and is marked sent', async () => {
  const a = approvedUser(), b = approvedUser()
  const registry = fakeRegistry()
  const ca = registry.connect(a.id), cb = registry.connect(b.id)
  const m = row(a.id, { message: 'only for a' })
  await makeScheduler(registry).tick()
  assert.equal(messages.getById(m.id).status, 'sent')
  assert.deepEqual(ca.sent, [['g@g.us', 'only for a']])
  assert.equal(cb.sent.length, 0)
})

test('a template row goes out with the date a week after its send time in its own time zone, and the next occurrence keeps the zone', async () => {
  const u = approvedUser()
  const registry = fakeRegistry()
  const client = registry.connect(u.id)
  const sendAt = Date.now() - MIN
  const m = row(u.id, { message: '{{day}}.{{month}} 16:30', sendAt, timeZone: 'Pacific/Kiritimati', repeat: 'weekly' })
  await makeScheduler(registry).tick()
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Pacific/Kiritimati', day: '2-digit', month: '2-digit' })
    .formatToParts(new Date(sendAt + 7 * DAY)).map((p) => [p.type, p.value])) // Kiritimati has no daylight saving
  assert.deepEqual(client.sent, [['g@g.us', `${parts.day}.${parts.month} 16:30`]])
  const next = seriesRows(m.id).find((r) => r.status === 'pending')
  assert.equal(next.message, '{{day}}.{{month}} 16:30')
  assert.equal(next.time_zone, 'Pacific/Kiritimati')
})

test('a due row for a disabled owner never appears in due and is not sent', async () => {
  const u = approvedUser()
  const registry = fakeRegistry()
  const client = registry.connect(u.id)
  const m = row(u.id)
  users.setState(u.id, 'disabled')
  assert.ok(!messages.due(Date.now()).some((r) => r.id === m.id))
  await makeScheduler(registry).tick()
  assert.equal(messages.getById(m.id).status, 'pending')
  assert.equal(client.sent.length, 0)
})

test('a row whose owner is disabled between due() and claim is not claimed', async () => {
  const u = approvedUser()
  const registry = fakeRegistry()
  const client = registry.connect(u.id)
  const m = row(u.id)
  // The tick resolves the client after the due snapshot and before claim; disabling there mimics the race.
  const inner = registry.get
  registry.get = (id) => { users.setState(u.id, 'disabled'); return inner(id) }
  await makeScheduler(registry).tick()
  assert.equal(messages.getById(m.id).status, 'pending')
  assert.equal(client.sent.length, 0)
})

test('a row with a null owner is never claimed', async () => {
  const r = database.prepare(`
    INSERT INTO scheduled_messages (owner_id, group_jid, message, send_at, created_at) VALUES (NULL, 'g@g.us', 'orphan', ?, ?)
  `).run(Date.now() - MIN, Date.now())
  const id = Number(r.lastInsertRowid)
  assert.ok(!messages.due(Date.now()).some((x) => x.id === id))
  assert.equal(messages.claim(id), false)
  await makeScheduler(fakeRegistry()).tick()
  assert.equal(messages.getById(id).status, 'pending')
})

test('a sent weekly row queues exactly one next occurrence, and none when the series already has a pending row', async () => {
  const u = approvedUser()
  const registry = fakeRegistry()
  registry.connect(u.id)
  const first = row(u.id, { repeat: 'weekly' })
  await makeScheduler(registry).tick()
  let rows = seriesRows(first.id)
  assert.equal(rows.length, 2)
  assert.equal(rows[1].status, 'pending')
  assert.equal(rows[1].send_at, weeksLater(first.send_at))
  assert.equal(rows[1].owner_id, u.id)
  // Pull the follow-up back into the past so it is due while another pending row exists in the series.
  database.prepare('UPDATE scheduled_messages SET send_at = ? WHERE id = ?').run(Date.now() - MIN, rows[1].id)
  const extra = messages.create({ ownerId: u.id, groupJid: 'g@g.us', message: 'hi', sendAt: Date.now() + DAY, repeat: 'weekly', seriesId: first.id })
  await makeScheduler(registry).tick()
  rows = seriesRows(first.id)
  assert.equal(rows.length, 3)
  assert.deepEqual(rows.map((r) => r.status).sort(), ['pending', 'sent', 'sent'])
  assert.equal(rows.find((r) => r.status === 'pending').id, extra.id)
})

test('a send that keeps failing retries, then fails permanently', async () => {
  const u = approvedUser()
  const registry = fakeRegistry()
  registry.connect(u.id, async () => { throw new Error('boom') })
  const m = row(u.id)
  const s = makeScheduler(registry)
  await s.tick()
  let after = messages.getById(m.id)
  assert.equal(after.status, 'pending')
  assert.equal(after.attempts, 1)
  assert.equal(after.error, 'boom')
  await s.tick()
  after = messages.getById(m.id)
  assert.equal(after.status, 'failed')
  assert.equal(after.attempts, 2)
})

// --- sweepMissed ----------------------------------------------------------

test('AE3: the sweep marks the 5-minute-old row missed and leaves tomorrow\'s row pending', () => {
  const u = approvedUser()
  const now = Date.now()
  const past = row(u.id, { sendAt: now - 5 * MIN })
  const tomorrow = row(u.id, { sendAt: now + DAY })
  assert.deepEqual(sweepMissed(u.id, now), { missed: 1, scheduled: 0 })
  assert.equal(messages.getById(past.id).status, 'missed')
  assert.equal(messages.getById(tomorrow.id).status, 'pending')
  assert.equal(ownerRows(u.id).length, 2)
})

test('a missed non-recurring row creates no follow-up', () => {
  const u = approvedUser()
  const now = Date.now()
  row(u.id, { sendAt: now - HOUR })
  assert.deepEqual(sweepMissed(u.id, now), { missed: 1, scheduled: 0 })
  assert.deepEqual(ownerRows(u.id).map((r) => r.status), ['missed'])
})

test('the sweep touches only the given owner\'s rows', () => {
  const a = approvedUser(), b = approvedUser()
  const now = Date.now()
  row(a.id, { sendAt: now - HOUR })
  const other = row(b.id, { sendAt: now - HOUR })
  sweepMissed(a.id, now)
  assert.equal(messages.getById(other.id).status, 'pending')
})

test('AE11: a weekly row missed 16 days ago is replaced by one row at the first weekly occurrence after now', () => {
  const u = approvedUser()
  const now = Date.now()
  const missed = row(u.id, { sendAt: now - 16 * DAY, repeat: 'weekly' })
  assert.deepEqual(sweepMissed(u.id, now), { missed: 1, scheduled: 1 })
  const rows = seriesRows(missed.id)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].id, missed.id)
  assert.equal(rows[0].status, 'missed')
  const next = rows[1]
  assert.equal(next.status, 'pending')
  assert.equal(next.send_at, weeksLater(missed.send_at, 3)) // -16d -> -9d -> -2d -> +5d
  assert.ok(next.send_at > now)
  assert.equal(next.series_id, missed.id)
  assert.equal(next.owner_id, u.id)
  assert.equal(next.repeat_rule, 'weekly')
  assert.equal(next.group_jid, missed.group_jid)
  assert.equal(next.group_name, missed.group_name)
  assert.equal(next.message, missed.message)
  assert.equal(next.attempts, 0)
})

test('the sweep adds no second pending row to a series that already has one in the future', () => {
  const u = approvedUser()
  const now = Date.now()
  const missed = row(u.id, { sendAt: now - WEEK, repeat: 'weekly' })
  const future = messages.create({ ownerId: u.id, groupJid: 'g@g.us', message: 'hi', sendAt: now + DAY, repeat: 'weekly', seriesId: missed.id })
  assert.deepEqual(sweepMissed(u.id, now), { missed: 1, scheduled: 0 })
  const rows = seriesRows(missed.id)
  assert.deepEqual(rows.map((r) => [r.id, r.status]), [[missed.id, 'missed'], [future.id, 'pending']])
})

test('monthly fast-forward keeps the anchor day across a shorter month', () => {
  const u = approvedUser()
  const anchor = row(u.id, { sendAt: local(2026, 1, 31), repeat: 'monthly' })
  messages.claim(anchor.id); messages.markSent(anchor.id)
  const missed = messages.create({ ownerId: u.id, groupJid: 'g@g.us', message: 'hi', sendAt: local(2026, 2, 28), repeat: 'monthly', seriesId: anchor.id })
  assert.deepEqual(sweepMissed(u.id, local(2026, 3, 15)), { missed: 1, scheduled: 1 })
  const rows = seriesRows(anchor.id)
  assert.equal(rows.length, 3)
  assert.equal(messages.getById(missed.id).status, 'missed')
  assert.equal(rows[2].send_at, local(2026, 3, 31))
  assert.equal(rows[2].status, 'pending')
})

test('monthly fast-forward with the anchor row deleted uses the missed row\'s own day and does not drift over two periods', () => {
  const u = approvedUser()
  const anchor = row(u.id, { sendAt: local(2026, 1, 31), repeat: 'monthly' })
  messages.claim(anchor.id); messages.markSent(anchor.id)
  const missed = messages.create({ ownerId: u.id, groupJid: 'g@g.us', message: 'hi', sendAt: local(2026, 2, 28), repeat: 'monthly', seriesId: anchor.id })
  assert.equal(messages.delete(anchor.id, u.id), true)
  assert.deepEqual(sweepMissed(u.id, local(2026, 4, 15)), { missed: 1, scheduled: 1 })
  const rows = seriesRows(anchor.id)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].id, missed.id)
  assert.equal(rows[0].status, 'missed')
  assert.equal(rows[1].send_at, local(2026, 4, 28))
  assert.equal(rows[1].status, 'pending')
})

test('the sweep runs inside the caller\'s transaction without opening its own', () => {
  const u = approvedUser()
  const now = Date.now()
  users.setState(u.id, 'disabled')
  const past = row(u.id, { sendAt: now - HOUR })
  transaction(() => { users.setState(u.id, 'approved'); sweepMissed(u.id, now) })
  assert.equal(users.get(u.id).state, 'approved')
  assert.equal(messages.getById(past.id).status, 'missed')
  // A failure inside the transaction rolls the sweep back as well.
  const past2 = row(u.id, { sendAt: now - HOUR })
  assert.throws(() => transaction(() => { sweepMissed(u.id, now); throw new Error('abort') }), /abort/)
  assert.equal(messages.getById(past2.id).status, 'pending')
})

// --- resume ---------------------------------------------------------------

test('sweep then start: the connect tick finds nothing stale and leaves the future rows pending', async () => {
  const u = approvedUser()
  const now = Date.now()
  users.setState(u.id, 'disabled')
  const stale = row(u.id, { sendAt: now - 2 * DAY, repeat: 'weekly' })
  const future = row(u.id, { sendAt: now + DAY })
  const registry = fakeRegistry()
  const client = registry.connect(u.id)
  transaction(() => { users.setState(u.id, 'approved'); sweepMissed(u.id, now) })
  const s = makeScheduler(registry)
  s.start()
  registry.events.emit('connected', u.id)
  await settle()
  s.stop()
  assert.equal(client.sent.length, 0)
  const rows = ownerRows(u.id)
  assert.equal(rows.length, 3)
  assert.equal(messages.getById(stale.id).status, 'missed')
  assert.equal(messages.getById(future.id).status, 'pending')
  const next = rows.find((r) => r.id !== stale.id && r.id !== future.id)
  assert.equal(next.status, 'pending')
  assert.equal(next.send_at, weeksLater(stale.send_at))
  assert.equal(registry.events.listenerCount('connected'), 0)
})

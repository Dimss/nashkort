import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { freshData } from './helpers/tempdata.js'

let env, messages, groupMessages, owner
const HOUR = 60 * 60 * 1000
const row = (over = {}) => ({ ownerId: owner.id, groupJid: 'g1@g.us', groupName: 'Court', message: 'hi', sendAt: Date.now() + HOUR, ...over })

before(async () => {
  env = await freshData()
  const db = await env.load('db.js')
  messages = db.messages
  groupMessages = db.groupMessages
  owner = db.users.insertPending({ email: 'o@x', sub: 'auth0|o' })
  db.users.setState(owner.id, 'approved')
})
after(() => env.cleanup())

test('a weekly message becomes the anchor of its own series; follow-ups keep the series id', () => {
  const first = messages.create(row({ repeat: 'weekly' }))
  assert.equal(first.series_id, first.id)
  const next = messages.create(row({ repeat: 'weekly', seriesId: first.id }))
  assert.equal(next.series_id, first.id)
  const once = messages.create(row())
  assert.equal(once.series_id, null)
})

test('due returns pending rows at or before now and skips rows whose retry time is in the future', () => {
  const now = Date.now()
  const past = messages.create(row({ sendAt: now - HOUR, message: 'past' }))
  const future = messages.create(row({ sendAt: now + HOUR, message: 'future' }))
  const retrying = messages.create(row({ sendAt: now - 2 * HOUR, message: 'retry' }))
  messages.markRetry(retrying.id, 1, now + HOUR, 'boom')
  const ids = messages.due(now).map((r) => r.id)
  assert.ok(ids.includes(past.id))
  assert.ok(!ids.includes(future.id))
  assert.ok(!ids.includes(retrying.id))
})

test('claim succeeds once and fails for the same id afterwards', () => {
  const m = messages.create(row({ sendAt: Date.now() - HOUR }))
  assert.equal(messages.claim(m.id), true)
  assert.equal(messages.claim(m.id), false)
  assert.equal(messages.get(m.id, owner.id).status, 'sending')
})

test('cancel works only on pending rows; delete refuses a row that is being sent', () => {
  const pending = messages.create(row())
  assert.equal(messages.cancel(pending.id, owner.id), true)
  assert.equal(messages.cancel(pending.id, owner.id), false)
  const sending = messages.create(row({ sendAt: Date.now() - HOUR }))
  messages.claim(sending.id)
  assert.equal(messages.delete(sending.id, owner.id), false)
  messages.markSent(sending.id)
  assert.equal(messages.delete(sending.id, owner.id), true)
})

// --- saved group messages ------------------------------------------------------

test('a message seen again fills in what was missing and keeps its place in the arrival order', () => {
  const t = Date.UTC(2026, 9, 26, 5, 0, 0)
  groupMessages.record(owner.id, 'gm@g.us', { id: 'enc', sender: 'Dana', serverTime: t, undecrypted: true })
  groupMessages.record(owner.id, 'gm@g.us', { id: 'own', fromMe: true, text: 'court 3' }) // our send, before its ack
  groupMessages.record(owner.id, 'gm@g.us', { id: 'enc', sender: 'Dana', serverTime: t, text: 'decrypted now' })
  groupMessages.record(owner.id, 'gm@g.us', { id: 'own', fromMe: true, serverTime: t }) // the ack
  groupMessages.record(owner.id, 'gm@g.us', { id: 'own', fromMe: true, text: 'court 3' }) // Baileys' echo, no time
  const rows = groupMessages.between(owner.id, 'gm@g.us', t - 1000, t + 1000)
  assert.deepEqual(rows, [
    { id: 'enc', fromMe: false, sender: 'Dana', serverTime: t, text: 'decrypted now', undecrypted: false },
    { id: 'own', fromMe: true, sender: null, serverTime: t, text: 'court 3', undecrypted: false },
  ])
})

test('pruning removes messages older than 30 days and unlinking removes all of one owner\'s', () => {
  const now = Date.UTC(2026, 9, 26)
  const DAY = 24 * HOUR
  groupMessages.record(owner.id, 'gp@g.us', { id: 'old', serverTime: now - 31 * DAY, text: 'old' })
  groupMessages.record(owner.id, 'gp@g.us', { id: 'recent', serverTime: now - 29 * DAY, text: 'recent' })
  groupMessages.prune(now)
  assert.deepEqual(groupMessages.between(owner.id, 'gp@g.us', 0, now).map((r) => r.id), ['recent'])
  assert.ok(groupMessages.deleteForOwner(owner.id) >= 1)
  assert.equal(groupMessages.savedSince(owner.id), null)
})

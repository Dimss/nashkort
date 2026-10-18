import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { freshData } from './helpers/tempdata.js'

let env, messages
const HOUR = 60 * 60 * 1000
const row = (over = {}) => ({ groupJid: 'g1@g.us', groupName: 'Court', message: 'hi', sendAt: Date.now() + HOUR, ...over })

before(async () => {
  env = await freshData()
  ;({ messages } = await env.load('db.js'))
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
  assert.equal(messages.get(m.id).status, 'sending')
})

test('cancel works only on pending rows; delete refuses a row that is being sent', () => {
  const pending = messages.create(row())
  assert.equal(messages.cancel(pending.id), true)
  assert.equal(messages.cancel(pending.id), false)
  const sending = messages.create(row({ sendAt: Date.now() - HOUR }))
  messages.claim(sending.id)
  assert.equal(messages.delete(sending.id), false)
  messages.markSent(sending.id)
  assert.equal(messages.delete(sending.id), true)
})

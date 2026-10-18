import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextOccurrence, REPEAT_RULES } from '../src/recurrence.js'

const DAY = 24 * 60 * 60 * 1000
const local = (y, m, d, h = 10) => new Date(y, m - 1, d, h, 0, 0, 0).getTime()

test('weekly next occurrence is exactly seven days later', () => {
  const start = local(2026, 3, 2)
  assert.equal(nextOccurrence(start, 'weekly'), start + 7 * DAY)
})

test('monthly keeps the anchor day of month and clamps to shorter months', () => {
  const jan31 = local(2026, 1, 31)
  const feb = nextOccurrence(jan31, 'monthly', jan31)
  assert.equal(new Date(feb).getMonth(), 1)
  assert.equal(new Date(feb).getDate(), 28)
  const mar = nextOccurrence(feb, 'monthly', jan31)
  assert.equal(new Date(mar).getMonth(), 2)
  assert.equal(new Date(mar).getDate(), 31)
  assert.equal(new Date(mar).getHours(), 10)
})

test('non-repeating messages have no next occurrence', () => {
  assert.equal(nextOccurrence(local(2026, 1, 1), 'none'), null)
  assert.deepEqual([...REPEAT_RULES].sort(), ['monthly', 'none', 'weekly'])
})

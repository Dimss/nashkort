import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextOccurrence, fastForward, REPEAT_RULES } from '../src/recurrence.js'
import { zonedParts, zonedTime } from '../public/template.js'

const TZ = 'Asia/Jerusalem'
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const at = (year, month, day, hour = 10, minute = 0) => zonedTime({ year, month, day, hour, minute }, TZ)
const wall = (ms) => zonedParts(ms, TZ)

test('weekly next occurrence is seven days later at the same wall-clock time', () => {
  const start = at(2026, 3, 2)
  assert.equal(nextOccurrence(start, 'weekly', start, TZ), start + 7 * DAY)
})

test('weekly keeps 16:30 across both daylight-saving changes in Jerusalem', () => {
  const autumn = at(2026, 10, 22, 16, 30) // clocks go back on 25 October
  const afterAutumn = nextOccurrence(autumn, 'weekly', autumn, TZ)
  assert.equal(afterAutumn - autumn, 7 * DAY + HOUR)
  assert.deepEqual(wall(afterAutumn), { year: 2026, month: 10, day: 29, hour: 16, minute: 30, second: 0 })
  const spring = at(2026, 3, 23, 16, 30) // clocks go forward on 27 March
  const afterSpring = nextOccurrence(spring, 'weekly', spring, TZ)
  assert.equal(afterSpring - spring, 7 * DAY - HOUR)
  assert.equal(wall(afterSpring).hour, 16)
})

test('monthly keeps the anchor day of month and time, and clamps to shorter months', () => {
  const jan31 = at(2026, 1, 31)
  const feb = nextOccurrence(jan31, 'monthly', jan31, TZ)
  assert.deepEqual(wall(feb), { year: 2026, month: 2, day: 28, hour: 10, minute: 0, second: 0 })
  const mar = nextOccurrence(feb, 'monthly', jan31, TZ)
  assert.deepEqual(wall(mar), { year: 2026, month: 3, day: 31, hour: 10, minute: 0, second: 0 })
  const dec = at(2026, 12, 15)
  assert.deepEqual(wall(nextOccurrence(dec, 'monthly', dec, TZ)), { year: 2027, month: 1, day: 15, hour: 10, minute: 0, second: 0 })
})

test('monthly counts days in the app time zone, not UTC: 00:30 on the 1st stays on the 1st', () => {
  const first = at(2026, 4, 1, 0, 30) // 31 March 21:30 UTC
  const next = nextOccurrence(first, 'monthly', first, TZ)
  assert.deepEqual(wall(next), { year: 2026, month: 5, day: 1, hour: 0, minute: 30, second: 0 })
})

test('milliseconds of the source time are kept', () => {
  const start = at(2026, 3, 2) + 123
  assert.equal(nextOccurrence(start, 'weekly', start, TZ) % 1000, 123)
})

test('fast-forward lands on the first occurrence after now', () => {
  const start = at(2026, 1, 1)
  const now = at(2026, 1, 20)
  assert.deepEqual(wall(fastForward(start, 'weekly', start, now, TZ)), { year: 2026, month: 1, day: 22, hour: 10, minute: 0, second: 0 })
})

test('non-repeating messages have no next occurrence', () => {
  assert.equal(nextOccurrence(at(2026, 1, 1), 'none', undefined, TZ), null)
  assert.deepEqual([...REPEAT_RULES].sort(), ['monthly', 'none', 'weekly'])
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderTemplate, unknownPlaceholders, isValidTimeZone, zonedTime } from '../public/template.js'

// 2026-03-04 22:30 UTC is already 5 March in Jerusalem (UTC+2) and still 4 March in New York.
const AT = Date.UTC(2026, 2, 4, 22, 30)
const TZ = 'Asia/Jerusalem'
const at = (year, month, day, hour = 8) => zonedTime({ year, month, day, hour }, TZ)

test('placeholders show the date one week after the send date, in the given time zone', () => {
  assert.equal(renderTemplate('{{day}}.{{month}} 16:30 - 18:00', AT, TZ), '12.03 16:30 - 18:00')
  assert.equal(renderTemplate('{{day}}.{{month}}.{{year}}', AT, 'America/New_York'), '11.03.2026')
})

test('a week ahead rolls over the month only when it crosses into the next month, and the year likewise', () => {
  assert.equal(renderTemplate('{{day}}.{{month}}', at(2026, 10, 30), TZ), '06.11')
  assert.equal(renderTemplate('{{day}}.{{month}}', at(2026, 11, 6), TZ), '13.11')
  assert.equal(renderTemplate('{{day}}.{{month}}', at(2026, 11, 20), TZ), '27.11')
  assert.equal(renderTemplate('{{day}}.{{month}}.{{year}}', at(2026, 12, 28), TZ), '04.01.2027')
  assert.equal(renderTemplate('{{day}}.{{month}}', at(2028, 2, 22), TZ), '29.02') // leap year
})

test('a week ahead across a daylight-saving change still lands on the right day', () => {
  assert.equal(renderTemplate('{{day}}.{{month}}', at(2026, 10, 22, 23), TZ), '29.10')
  assert.equal(renderTemplate('{{day}}.{{month}}', at(2026, 3, 22, 0), TZ), '29.03')
})

test('placeholders tolerate spaces and case; text without placeholders is unchanged', () => {
  assert.equal(renderTemplate('{{ Day }}/{{MONTH}}', AT, 'UTC'), '11/03')
  assert.equal(renderTemplate('plain {text} here', AT, 'UTC'), 'plain {text} here')
})

test('a missing or invalid time zone renders in UTC', () => {
  assert.equal(renderTemplate('{{day}}', AT, null), '11')
  assert.equal(renderTemplate('{{day}}', AT, 'Mars/Olympus'), '11')
  assert.equal(isValidTimeZone('Mars/Olympus'), false)
  assert.equal(isValidTimeZone('Europe/Moscow'), true)
})

test('unknown placeholders are reported and left in place', () => {
  assert.deepEqual(unknownPlaceholders('{{day}} {{weekday}} {{foo}}'), ['weekday', 'foo'])
  assert.deepEqual(unknownPlaceholders('{{day}}.{{month}}'), [])
  assert.equal(renderTemplate('{{day}} {{foo}}', AT, 'UTC'), '11 {{foo}}')
})

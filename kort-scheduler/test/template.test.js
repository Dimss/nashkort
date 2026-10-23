import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderTemplate, unknownPlaceholders, isValidTimeZone } from '../public/template.js'

// 2026-03-04 22:30 UTC is already 5 March in Jerusalem (UTC+2) and still 4 March in New York.
const AT = Date.UTC(2026, 2, 4, 22, 30)

test('day and month are two digits and year four, in the given time zone', () => {
  assert.equal(renderTemplate('{{day}}.{{month}} 16:30 - 18:00', AT, 'Asia/Jerusalem'), '05.03 16:30 - 18:00')
  assert.equal(renderTemplate('{{day}}.{{month}}.{{year}}', AT, 'America/New_York'), '04.03.2026')
})

test('placeholders tolerate spaces and case; text without placeholders is unchanged', () => {
  assert.equal(renderTemplate('{{ Day }}/{{MONTH}}', AT, 'UTC'), '04/03')
  assert.equal(renderTemplate('plain {text} here', AT, 'UTC'), 'plain {text} here')
})

test('a missing or invalid time zone renders in UTC', () => {
  assert.equal(renderTemplate('{{day}}', AT, null), '04')
  assert.equal(renderTemplate('{{day}}', AT, 'Mars/Olympus'), '04')
  assert.equal(isValidTimeZone('Mars/Olympus'), false)
  assert.equal(isValidTimeZone('Europe/Moscow'), true)
})

test('unknown placeholders are reported and left in place', () => {
  assert.deepEqual(unknownPlaceholders('{{day}} {{weekday}} {{foo}}'), ['weekday', 'foo'])
  assert.deepEqual(unknownPlaceholders('{{day}}.{{month}}'), [])
  assert.equal(renderTemplate('{{day}} {{foo}}', AT, 'UTC'), '04 {{foo}}')
})

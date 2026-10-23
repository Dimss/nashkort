// Message templates and wall-clock time in a fixed time zone. {{day}},
// {{month}} and {{year}} become the date of the scheduled send time in the
// app's time zone (two-digit day and month, four-digit year). Shared by the
// server (sending, recurrence, message list) and the page (form, preview), so
// both read and write times the same way.
export const PLACEHOLDERS = ['day', 'month', 'year']
const TOKEN = /\{\{\s*([A-Za-z]+)\s*\}\}/g

// Placeholder names in `text` that are not supported, as typed.
export function unknownPlaceholders(text) {
  const names = new Set()
  for (const [, name] of text.matchAll(TOKEN)) {
    if (!PLACEHOLDERS.includes(name.toLowerCase())) names.add(name)
  }
  return [...names]
}

export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone || timeZone.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone })
    return true
  } catch {
    return false
  }
}

const partsFormats = new Map()

// Wall-clock fields of `ms` in `timeZone`: { year, month (1-12), day, hour, minute, second }.
export function zonedParts(ms, timeZone) {
  let f = partsFormats.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    partsFormats.set(timeZone, f)
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, Number(x.value)]))
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second }
}

// Epoch ms of a wall-clock time in `timeZone`. Out-of-range fields roll over
// (day 32 is the 1st of the next month). A time skipped by a daylight-saving
// jump lands just after the jump.
export function zonedTime({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone) {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second)
  const offsetAt = (ms) => {
    const p = zonedParts(ms, timeZone)
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000
  }
  const guess = wall - offsetAt(wall)
  return wall - offsetAt(guess)
}

// A missing or unknown time zone falls back to UTC.
export function renderTemplate(text, sendAt, timeZone) {
  if (!text.includes('{{')) return text
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC'
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, day: '2-digit', month: '2-digit', year: 'numeric' })
    .formatToParts(new Date(sendAt))
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]))
  return text.replace(TOKEN, (match, name) => values[name.toLowerCase()] ?? match)
}

if (typeof window !== 'undefined') {
  window.MessageTemplate = { PLACEHOLDERS, unknownPlaceholders, renderTemplate, zonedParts, zonedTime }
}

// Message templates. {{day}}, {{month}} and {{year}} become the date of the
// scheduled send time in the sender's time zone (two-digit day and month,
// four-digit year). Shared by the server (sending, message list) and the page
// (live preview), so what the preview shows is what goes out.
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
  window.MessageTemplate = { PLACEHOLDERS, unknownPlaceholders, renderTemplate }
}

export const REPEAT_RULES = new Set(['none', 'weekly', 'monthly'])

// Returns the epoch ms of the next occurrence after `sendAt`, or null if the
// series doesn't repeat. Monthly keeps the series' original day-of-month
// (from `anchorSendAt`, typically the very first occurrence), clamped to the
// last day of the target month (e.g. Jan 31 -> Feb 28 -> Mar 31, not Mar 28 -
// chaining off the previous, already-clamped occurrence would drift).
export function nextOccurrence(sendAt, repeat, anchorSendAt = sendAt) {
  if (repeat === 'weekly') return sendAt + 7 * 24 * 60 * 60 * 1000
  if (repeat === 'monthly') {
    const anchor = new Date(anchorSendAt)
    const day = anchor.getDate()
    const h = anchor.getHours(), m = anchor.getMinutes(), s = anchor.getSeconds(), ms = anchor.getMilliseconds()
    const d = new Date(sendAt)
    d.setDate(1)
    d.setMonth(d.getMonth() + 1)
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(day, lastDay))
    d.setHours(h, m, s, ms)
    return d.getTime()
  }
  return null
}

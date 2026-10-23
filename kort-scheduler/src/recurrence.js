import { zonedParts, zonedTime } from '../public/template.js'

export const REPEAT_RULES = new Set(['none', 'weekly', 'monthly'])

// Returns the epoch ms of the next occurrence after `sendAt`, or null if the
// series doesn't repeat. Dates are counted on the wall clock of `timeZone`, so
// a 16:30 message stays at 16:30 across a daylight-saving change.
// Weekly is seven calendar days later at the same time. Monthly keeps the
// series' original day-of-month and time (from `anchorSendAt`, typically the
// very first occurrence), clamped to the last day of the target month (e.g.
// Jan 31 -> Feb 28 -> Mar 31, not Mar 28 - chaining off the previous,
// already-clamped occurrence would drift).
export function nextOccurrence(sendAt, repeat, anchorSendAt = sendAt, timeZone = 'UTC') {
  if (repeat === 'weekly') {
    const p = zonedParts(sendAt, timeZone)
    return zonedTime({ ...p, day: p.day + 7 }, timeZone) + (sendAt % 1000)
  }
  if (repeat === 'monthly') {
    const anchor = zonedParts(anchorSendAt, timeZone)
    const current = zonedParts(sendAt, timeZone)
    const year = current.month === 12 ? current.year + 1 : current.year
    const month = current.month === 12 ? 1 : current.month + 1
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return zonedTime({ ...anchor, year, month, day: Math.min(anchor.day, lastDay) }, timeZone) + (anchorSendAt % 1000)
  }
  return null
}

// Applies nextOccurrence from `sendAt` until the result lands strictly after
// `now`; used to move a series past occurrences that were missed. Null when
// the series doesn't repeat.
export function fastForward(sendAt, repeat, anchorSendAt = sendAt, now = Date.now(), timeZone = 'UTC') {
  let t = sendAt
  do {
    t = nextOccurrence(t, repeat, anchorSendAt, timeZone)
    if (t == null) return null
  } while (t <= now)
  return t
}

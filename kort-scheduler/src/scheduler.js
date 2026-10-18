import { config as defaultConfig } from './config.js'
import { messages } from './db.js'
import { nextOccurrence, fastForward } from './recurrence.js'
import { clients } from './clients.js'

// Inserts the next row of a recurring series after `row` unless the series
// already has a pending one. The anchor is the series' first row; when that
// row has been deleted, the finishing row's own time stands in for it.
function queueOccurrence(row, sendAt, seriesId) {
  const next = messages.create({
    ownerId: row.owner_id,
    groupJid: row.group_jid,
    groupName: row.group_name,
    message: row.message,
    sendAt,
    repeat: row.repeat_rule,
    seriesId,
  })
  console.log(`[scheduler] queued next ${row.repeat_rule} occurrence #${next.id} for ${new Date(sendAt).toISOString()}`)
  return next
}

// Once a recurring message reaches a terminal state (sent or permanently
// failed), queue up its next occurrence so the series keeps going.
function scheduleNextOccurrence(row) {
  const seriesId = row.series_id ?? row.id
  if (messages.seriesHasPending(seriesId)) return
  const anchor = messages.getById(seriesId)
  const sendAt = nextOccurrence(row.send_at, row.repeat_rule, anchor?.send_at ?? row.send_at)
  if (!sendAt) return
  queueOccurrence(row, sendAt, seriesId)
}

// Resume step for a re-enabled owner: every pending row whose time has passed
// is marked missed and never sent; a missed recurring row moves its series to
// the first occurrence after `now`, one row per series. Plain statements only,
// so the caller can run it inside its own transaction together with the state
// flip. Returns the counts for logging.
export function sweepMissed(ownerId, now = Date.now()) {
  let missed = 0
  let scheduled = 0
  for (const row of messages.pastDueForOwner(ownerId, now)) {
    if (!messages.markMissed(row.id)) continue
    missed++
    console.log(`[scheduler] #${row.id} missed: due ${new Date(row.send_at).toISOString()} while owner ${ownerId} was disabled`)
    if (row.repeat_rule === 'none') continue
    const seriesId = row.series_id ?? row.id
    if (messages.seriesHasPending(seriesId)) continue
    const anchor = messages.getById(seriesId)
    const sendAt = fastForward(row.send_at, row.repeat_rule, anchor?.send_at ?? row.send_at, now)
    if (!sendAt) continue
    queueOccurrence(row, sendAt, seriesId)
    scheduled++
  }
  return { missed, scheduled }
}

export function createScheduler({ registry, config = defaultConfig }) {
  let timer = null
  let running = false
  let onConnected = null

  async function tick() {
    if (running) return
    running = true
    try {
      const now = Date.now()
      for (const row of messages.due(now)) {
        const client = registry.get(row.owner_id)
        if (!client?.connected) continue // leave the row pending; it goes out once that user's phone is connected
        if (!messages.claim(row.id)) continue
        const attempts = row.attempts + 1
        try {
          await client.sendText(row.group_jid, row.message)
          messages.markSent(row.id)
          console.log(`[scheduler] sent #${row.id} to ${row.group_name ?? row.group_jid}`)
          if (row.repeat_rule !== 'none') scheduleNextOccurrence(row)
        } catch (err) {
          const msg = err?.message ?? String(err)
          if (attempts >= config.maxAttempts) {
            messages.markFailed(row.id, attempts, msg)
            console.error(`[scheduler] #${row.id} failed permanently: ${msg}`)
            if (row.repeat_rule !== 'none') scheduleNextOccurrence(row)
          } else {
            messages.markRetry(row.id, attempts, Date.now() + config.retryDelayMs, msg)
            console.warn(`[scheduler] #${row.id} attempt ${attempts} failed, retrying: ${msg}`)
          }
        }
      }
    } catch (err) {
      console.error('[scheduler] tick error', err)
    } finally {
      running = false
    }
  }

  return {
    start() {
      if (timer) return
      timer = setInterval(tick, config.tickMs)
      // Run a tick as soon as any user's phone (re)connects so overdue messages go out promptly.
      onConnected = () => tick()
      registry.events.on('connected', onConnected)
      tick()
    },
    stop() {
      clearInterval(timer)
      timer = null
      if (onConnected) registry.events.off('connected', onConnected)
      onConnected = null
    },
    tick,
  }
}

export const scheduler = createScheduler({ registry: clients })

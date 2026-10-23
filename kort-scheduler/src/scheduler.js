import { config as defaultConfig } from './config.js'
import { messages } from './db.js'
import { nextOccurrence, fastForward } from './recurrence.js'
import { clients } from './clients.js'
import { hasCredentials } from './whatsapp.js'
import { renderTemplate } from '../public/template.js'

// Moves a recurring series on from `row` unless it already has a pending row.
// `nextSendAt(anchorSendAt)` picks the time; the anchor is the series' first
// row, or the finishing row itself when that first row was deleted.
function requeueSeries(row, nextSendAt) {
  const seriesId = row.series_id ?? row.id
  if (messages.seriesHasPending(seriesId)) return null
  const anchor = messages.getById(seriesId)
  const sendAt = nextSendAt(anchor?.send_at ?? row.send_at)
  if (!sendAt) return null
  const next = messages.create({
    ownerId: row.owner_id,
    groupJid: row.group_jid,
    groupName: row.group_name,
    message: row.message,
    sendAt,
    repeat: row.repeat_rule,
    seriesId,
    timeZone: row.time_zone,
  })
  console.log(`[scheduler] queued next ${row.repeat_rule} occurrence #${next.id} for ${new Date(sendAt).toISOString()}`)
  return next
}

function scheduleNextOccurrence(row) {
  requeueSeries(row, (anchorSendAt) => nextOccurrence(row.send_at, row.repeat_rule, anchorSendAt))
}

// Resume step for a re-enabled owner: pending rows whose time has passed are
// marked missed, and a missed recurring row moves its series to the first
// occurrence after `now`. Plain statements, so the caller's transaction wraps it.
export function sweepMissed(ownerId, now = Date.now()) {
  let missed = 0
  let scheduled = 0
  for (const row of messages.pastDueForOwner(ownerId, now)) {
    if (!messages.markMissed(row.id)) continue
    missed++
    console.log(`[scheduler] #${row.id} missed: due ${new Date(row.send_at).toISOString()} while owner ${ownerId} was disabled`)
    if (row.repeat_rule === 'none') continue
    if (requeueSeries(row, (anchorSendAt) => fastForward(row.send_at, row.repeat_rule, anchorSendAt, now))) scheduled++
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
        if (!client) {
          // A linked owner with no client (start failed earlier): start one; the
          // 'connected' event re-runs the tick, so the row goes out then.
          if (hasCredentials(config.authDirFor(row.owner_id))) registry.ensure(row.owner_id)
          continue
        }
        if (!client.connected) continue
        if (!messages.claim(row.id)) continue
        const attempts = row.attempts + 1
        try {
          await client.sendText(row.group_jid, renderTemplate(row.message, row.send_at, row.time_zone))
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

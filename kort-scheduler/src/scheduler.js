import { config as defaultConfig } from './config.js'
import { messages } from './db.js'
import { nextOccurrence, fastForward } from './recurrence.js'
import { clients } from './clients.js'
import { hasCredentials } from './whatsapp.js'
import { renderTemplate } from '../public/template.js'

// Moves a recurring series on from `row` unless it already has a pending row.
// `nextSendAt(anchorSendAt, timeZone)` picks the time; the anchor is the series' first
// row, or the finishing row itself when that first row was deleted.
function requeueSeries(row, nextSendAt) {
  const seriesId = row.series_id ?? row.id
  if (messages.seriesHasPending(seriesId)) return null
  const anchor = messages.getById(seriesId)
  const sendAt = nextSendAt(anchor?.send_at ?? row.send_at, zoneOf(row))
  if (!sendAt) return null
  const next = messages.create({
    ownerId: row.owner_id,
    groupJid: row.group_jid,
    groupName: row.group_name,
    message: row.message,
    sendAt,
    repeat: row.repeat_rule,
    seriesId,
    timeZone: zoneOf(row),
  })
  console.log(`[scheduler] queued next ${row.repeat_rule} occurrence #${next.id} for ${new Date(sendAt).toISOString()}`)
  return next
}

// Rows from before the time zone was stored use the configured one.
function zoneOf(row) {
  return row.time_zone ?? defaultConfig.timeZone
}

function scheduleNextOccurrence(row) {
  requeueSeries(row, (anchorSendAt, zone) => nextOccurrence(row.send_at, row.repeat_rule, anchorSendAt, zone))
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
    if (requeueSeries(row, (anchorSendAt, zone) => fastForward(row.send_at, row.repeat_rule, anchorSendAt, now, zone))) scheduled++
  }
  return { missed, scheduled }
}

// setTimeout fires at once for delays above about 24.8 days; longer waits are
// split and re-armed when they expire.
const MAX_DELAY_MS = 2 ** 31 - 1

// Sends are driven by a timer set for the next row's exact send time, re-armed
// after every tick and whenever a row is created. The `tickMs` poll stays as a
// backstop for rows that came due while their owner was offline.
export function createScheduler({ registry, config = defaultConfig }) {
  let timer = null
  let wakeTimer = null
  let running = false
  let onConnected = null
  let onCreated = null

  function arm() {
    clearTimeout(wakeTimer)
    wakeTimer = null
    if (!timer) return
    const now = Date.now()
    const at = messages.nextWakeAfter(now)
    if (at == null) return
    wakeTimer = setTimeout(tick, Math.min(at - now, MAX_DELAY_MS))
  }

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
          await client.sendText(row.group_jid, renderTemplate(row.message, row.send_at, zoneOf(row)))
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
      arm()
    }
  }

  return {
    start() {
      if (timer) return
      timer = setInterval(tick, config.tickMs)
      onConnected = () => tick()
      registry.events.on('connected', onConnected)
      // A tick in progress re-arms when it finishes, after its own new rows.
      onCreated = () => { if (!running) arm() }
      messages.events.on('created', onCreated)
      tick()
    },
    stop() {
      clearInterval(timer)
      timer = null
      clearTimeout(wakeTimer)
      wakeTimer = null
      if (onConnected) registry.events.off('connected', onConnected)
      if (onCreated) messages.events.off('created', onCreated)
      onConnected = null
      onCreated = null
    },
    tick,
  }
}

export const scheduler = createScheduler({ registry: clients })

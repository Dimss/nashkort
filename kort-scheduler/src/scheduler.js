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

// A send timer wakes this much early and the last stretch is waited out on the
// clock, since setTimeout can fire a few milliseconds late but never early.
const SPIN_MS = 15

// Each row gets its own timer for its exact send time once it is within
// `prepareLeadMs`. At that point the owner's client also does the network work
// of the send (group members, devices, sessions), so at the send time only
// local encryption and one socket write remain. A wake timer fires when the
// next row enters that window. The `tickMs` poll stays as a backstop for rows
// that came due while their owner was offline.
export function createScheduler({ registry, config = defaultConfig }) {
  let timer = null
  let wakeTimer = null
  let running = false
  let onConnected = null
  let onCreated = null
  const planned = new Map() // row id -> its send timer
  const prepared = new Set() // row ids whose group send was prepared (or is being)

  const leadMs = () => config.prepareLeadMs ?? 60_000

  function plan() {
    clearTimeout(wakeTimer)
    wakeTimer = null
    if (!timer) return
    const now = Date.now()
    const lead = leadMs()
    const preparing = new Set()
    for (const row of messages.upcoming(now, now + lead)) {
      if (!planned.has(row.id)) {
        planned.set(row.id, setTimeout(() => fire(row.id, row.at), Math.max(0, row.at - now - SPIN_MS)))
      }
      // Retried on every plan (each tick, and when a phone connects) until it starts.
      if (prepared.has(row.id)) continue
      const key = `${row.owner_id} ${row.group_jid}`
      if (preparing.has(key) || prepare(row)) {
        preparing.add(key)
        prepared.add(row.id)
      }
    }
    const at = messages.nextWakeAfter(now + lead)
    if (at != null) wakeTimer = setTimeout(plan, Math.min(at - lead - now, MAX_DELAY_MS))
  }

  // Best effort: a failure here only means the send does that work itself.
  // False when the owner's phone is not connected, so a later plan tries again.
  function prepare(row) {
    const client = registry.get(row.owner_id)
    if (!client) {
      if (hasCredentials(config.authDirFor(row.owner_id))) registry.ensure(row.owner_id)
      return false
    }
    if (!client.connected) return false
    if (typeof client.prepareGroupSend !== 'function') return true
    const started = Date.now()
    client.prepareGroupSend(row.group_jid).then(
      (r) => console.log(`[scheduler] prepared #${row.id} in ${Date.now() - started} ms (${r.participants} members, ${r.devices} devices, ${r.newSessions} new sessions)`),
      (err) => console.warn(`[scheduler] could not prepare #${row.id}: ${err?.message ?? err}`),
    )
    return true
  }

  async function fire(id, at) {
    while (Date.now() < at) { /* the last few milliseconds before the send time */ }
    planned.delete(id)
    prepared.delete(id)
    const row = messages.getById(id)
    if (!row || row.status !== 'pending') return
    try {
      await sendRow(row, at)
    } catch (err) {
      console.error(`[scheduler] send of #${id} failed unexpectedly`, err)
    }
  }

  async function sendRow(row, dueAt = Math.max(row.send_at, row.next_attempt_at ?? 0)) {
    const client = registry.get(row.owner_id)
    if (!client) {
      // A linked owner with no client (start failed earlier): start one; the
      // 'connected' event runs a tick, so the row goes out then.
      if (hasCredentials(config.authDirFor(row.owner_id))) registry.ensure(row.owner_id)
      return
    }
    if (!client.connected) return
    if (!messages.claim(row.id)) return
    const attempts = row.attempts + 1
    try {
      const result = await client.sendText(row.group_jid, renderTemplate(row.message, row.send_at, zoneOf(row)))
      const written = Date.now() - dueAt
      messages.markSent(row.id)
      if (row.repeat_rule !== 'none') scheduleNextOccurrence(row)
      const to = row.group_name ?? row.group_jid
      if (result?.ack) {
        result.ack.then((ack) => {
          const server = ack ? `server ack +${ack.at - dueAt} ms${ack.error ? ` (error ${ack.error})` : ''}` : 'no server ack within 10 s'
          console.log(`[scheduler] sent #${row.id} to ${to}: written +${written} ms, ${server}`)
        })
      } else {
        console.log(`[scheduler] sent #${row.id} to ${to}: written +${written} ms`)
      }
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

  // Rows already due that no send timer is waiting for. Rows for different
  // groups go out in parallel; rows for the same group keep their order.
  async function tick() {
    if (running) return
    running = true
    try {
      const chains = new Map()
      for (const row of messages.due(Date.now())) {
        if (planned.has(row.id)) continue
        const key = `${row.owner_id} ${row.group_jid}`
        chains.set(key, [...(chains.get(key) ?? []), row])
      }
      await Promise.all([...chains.values()].map(async (rows) => {
        for (const row of rows) await sendRow(row)
      }))
    } catch (err) {
      console.error('[scheduler] tick error', err)
    } finally {
      running = false
      plan()
    }
  }

  return {
    start() {
      if (timer) return
      timer = setInterval(tick, config.tickMs)
      onConnected = () => tick()
      registry.events.on('connected', onConnected)
      onCreated = () => plan()
      messages.events.on('created', onCreated)
      tick()
    },
    stop() {
      clearInterval(timer)
      timer = null
      clearTimeout(wakeTimer)
      wakeTimer = null
      for (const t of planned.values()) clearTimeout(t)
      planned.clear()
      prepared.clear()
      if (onConnected) registry.events.off('connected', onConnected)
      if (onCreated) messages.events.off('created', onCreated)
      onConnected = null
      onCreated = null
    },
    tick,
  }
}

export const scheduler = createScheduler({ registry: clients })

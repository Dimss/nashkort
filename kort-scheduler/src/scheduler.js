import { config } from './config.js'
import { messages } from './db.js'
import { nextOccurrence } from './recurrence.js'
import { whatsapp } from './whatsapp.js'

let timer = null
let running = false

// Once a recurring message reaches a terminal state (sent or permanently
// failed), queue up its next occurrence so the series keeps going.
function scheduleNextOccurrence(row) {
  const anchor = messages.get(row.series_id ?? row.id)
  const sendAt = nextOccurrence(row.send_at, row.repeat_rule, anchor?.send_at)
  if (!sendAt) return
  const next = messages.create({
    groupJid: row.group_jid,
    groupName: row.group_name,
    message: row.message,
    sendAt,
    repeat: row.repeat_rule,
    seriesId: row.series_id ?? row.id,
  })
  console.log(`[scheduler] queued next ${row.repeat_rule} occurrence #${next.id} for ${new Date(sendAt).toISOString()}`)
}

async function tick() {
  if (running) return
  running = true
  try {
    if (!whatsapp.connected) return // leave messages pending; they go out once connected
    const now = Date.now()
    for (const row of messages.due(now)) {
      if (!messages.claim(row.id)) continue
      const attempts = row.attempts + 1
      try {
        await whatsapp.sendText(row.group_jid, row.message)
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

export const scheduler = {
  start() {
    if (timer) return
    timer = setInterval(tick, config.tickMs)
    tick()
    // Run a tick as soon as we (re)connect so overdue messages go out promptly.
    whatsapp.on('status', (s) => s === 'connected' && tick())
  },
  stop() {
    clearInterval(timer)
    timer = null
  },
  tick,
}

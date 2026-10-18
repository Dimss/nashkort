import { EventEmitter } from 'node:events'
import pino from 'pino'
import { config } from './config.js'
import { WhatsAppClient, hasCredentials } from './whatsapp.js'

const IDLE_STATUSES = new Set(['connecting', 'qr'])

/** One WhatsApp client per user, keyed by the integer user id the session gate attaches. */
export function createRegistry({ makeClient, idleMs = 5 * 60_000, staggerMs = 2000, sweepMs = 60_000 } = {}) {
  const clients = new Map()
  const lastPollAt = new Map()
  const events = new EventEmitter()

  const requireId = (userId) => {
    if (!Number.isInteger(userId) || userId <= 0) throw new TypeError('user id must be a positive integer')
    return userId
  }

  const registry = {
    events,
    get size() { return clients.size },

    get(userId) {
      return clients.get(requireId(userId))
    },

    ensure(userId, now = Date.now()) {
      requireId(userId)
      lastPollAt.set(userId, now)
      let client = clients.get(userId)
      if (client) return client
      client = makeClient(userId)
      clients.set(userId, client)
      client.on('status', (status) => {
        if (clients.get(userId) !== client) return
        if (status === 'connected') events.emit('connected', userId)
      })
      client.start().catch((err) => {
        client.logger?.error?.({ err }, 'client start failed')
        if (clients.get(userId) === client) clients.delete(userId)
      })
      return client
    },

    snapshot(userId, now = Date.now()) {
      requireId(userId)
      lastPollAt.set(userId, now)
      const client = clients.get(userId)
      if (client) return client.snapshot()
      return {
        status: 'idle',
        connected: false,
        qr: null,
        me: null,
        lastError: null,
        linked: hasCredentials(config.authDirFor(userId)),
      }
    },

    async stop(userId) {
      const client = clients.get(requireId(userId))
      if (!client) return false
      clients.delete(userId)
      lastPollAt.delete(userId)
      await client.stop()
      return true
    },

    async stopAll() {
      const all = [...clients.keys()]
      await Promise.all(all.map((id) => registry.stop(id)))
    },

    // Only a client still waiting for a scan is swept: a linked client passes through
    // 'connecting' on every reconnect and must survive without a page open.
    sweepIdle(now = Date.now()) {
      for (const [userId, client] of clients) {
        const polled = lastPollAt.get(userId) ?? 0
        if (!client.linked && IDLE_STATUSES.has(client.status) && now - polled > idleMs) {
          client.logger?.info?.('stopping idle unlinked client')
          registry.stop(userId).catch(() => {})
        }
      }
    },

    async bootAll(userIds, now = Date.now()) {
      let delay = 0
      const started = []
      for (const userId of userIds) {
        requireId(userId)
        if (!hasCredentials(config.authDirFor(userId))) continue
        started.push(new Promise((resolve) => {
          const t = setTimeout(() => { registry.ensure(userId, now); resolve() }, delay)
          t.unref?.()
        }))
        delay += staggerMs
      }
      await Promise.all(started)
    },
  }

  if (sweepMs > 0) {
    const timer = setInterval(() => registry.sweepIdle(), sweepMs)
    timer.unref?.()
  }
  return registry
}

const baseLogger = pino({ level: config.waLogLevel })

export const clients = createRegistry({
  makeClient(userId) {
    return new WhatsAppClient({
      authDir: config.authDirFor(userId),
      logger: baseLogger.child({ userId }),
      groupCacheMs: config.groupCacheMs,
    })
  },
})

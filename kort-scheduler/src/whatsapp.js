import fs from 'node:fs'
import { EventEmitter } from 'node:events'
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  Browsers,
} from '@whiskeysockets/baileys'
import pino from 'pino'
import QRCode from 'qrcode'
import { config } from './config.js'

const logger = pino({ level: config.waLogLevel })

/**
 * Manages a single WhatsApp connection: login via QR, auto-reconnect,
 * group listing and text sending.
 */
class WhatsAppClient extends EventEmitter {
  sock = null
  status = 'disconnected' // disconnected | connecting | qr | connected | logged_out
  qrDataUrl = null
  me = null
  lastError = null
  #groupCache = { at: 0, list: [] }
  #groupMeta = new Map()
  #reconnectTimer = null
  #stopped = false

  get connected() {
    return this.status === 'connected' && !!this.sock
  }

  async start() {
    this.#stopped = false
    clearTimeout(this.#reconnectTimer)
    this.#setStatus('connecting')

    const { state, saveCreds } = await useMultiFileAuthState(config.authDir)
    let version
    try {
      ;({ version } = await fetchLatestBaileysVersion())
    } catch (err) {
      logger.warn({ err }, 'could not fetch latest WA version, using bundled default')
    }

    const sock = makeWASocket({
      version,
      logger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      browser: Browsers.macOS('Desktop'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      cachedGroupMetadata: async (jid) => this.#groupMeta.get(jid),
    })
    this.sock = sock

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        try {
          this.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 })
        } catch (err) {
          logger.error({ err }, 'failed to render QR')
        }
        this.#setStatus('qr')
      }

      if (connection === 'open') {
        this.qrDataUrl = null
        this.lastError = null
        this.me = sock.user ?? null
        this.#setStatus('connected')
        logger.info({ me: this.me }, 'WhatsApp connected')
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode
        const loggedOut = statusCode === DisconnectReason.loggedOut
        this.lastError = lastDisconnect?.error?.message ?? null
        this.sock = null
        this.qrDataUrl = null
        this.me = null

        if (loggedOut) {
          logger.warn('logged out from WhatsApp; clearing credentials')
          this.#setStatus('logged_out')
          fs.rmSync(config.authDir, { recursive: true, force: true })
          // Start again so a fresh QR is offered.
          this.#scheduleReconnect(1000)
        } else if (!this.#stopped) {
          logger.warn({ statusCode, err: this.lastError }, 'connection closed; reconnecting')
          this.#setStatus('disconnected')
          this.#scheduleReconnect(3000)
        } else {
          this.#setStatus('disconnected')
        }
      }
    })

    // Keep the group metadata cache fresh so sends to groups avoid extra round-trips.
    sock.ev.on('groups.update', async (events) => {
      for (const ev of events) {
        if (!ev.id) continue
        try {
          this.#groupMeta.set(ev.id, await sock.groupMetadata(ev.id))
        } catch {}
      }
      this.#groupCache.at = 0
    })
    sock.ev.on('group-participants.update', async (ev) => {
      try {
        this.#groupMeta.set(ev.id, await sock.groupMetadata(ev.id))
      } catch {}
    })
  }

  #scheduleReconnect(delay) {
    clearTimeout(this.#reconnectTimer)
    this.#reconnectTimer = setTimeout(() => {
      this.start().catch((err) => {
        logger.error({ err }, 'reconnect failed')
        this.#scheduleReconnect(10_000)
      })
    }, delay)
  }

  #setStatus(status) {
    if (this.status !== status) {
      this.status = status
      this.emit('status', status)
    }
  }

  /** Returns [{ jid, name, participants }] sorted by name. */
  async listGroups({ force = false } = {}) {
    if (!this.connected) throw new Error('WhatsApp is not connected')
    const fresh = Date.now() - this.#groupCache.at < config.groupCacheMs
    if (!force && fresh) return this.#groupCache.list

    const all = await this.sock.groupFetchAllParticipating()
    const list = Object.values(all)
      .map((g) => {
        this.#groupMeta.set(g.id, g)
        return { jid: g.id, name: g.subject || g.id, participants: g.participants?.length ?? 0 }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
    this.#groupCache = { at: Date.now(), list }
    return list
  }

  async sendText(jid, text) {
    if (!this.connected) throw new Error('WhatsApp is not connected')
    return this.sock.sendMessage(jid, { text })
  }

  async logout() {
    this.#stopped = true
    clearTimeout(this.#reconnectTimer)
    try {
      await this.sock?.logout()
    } catch (err) {
      logger.warn({ err }, 'logout call failed; clearing local credentials anyway')
    }
    this.sock = null
    fs.rmSync(config.authDir, { recursive: true, force: true })
    this.#groupCache = { at: 0, list: [] }
    this.#groupMeta.clear()
    this.#setStatus('logged_out')
    // Offer a fresh QR right away.
    await this.start()
  }

  async stop() {
    this.#stopped = true
    clearTimeout(this.#reconnectTimer)
    this.sock?.end(undefined)
    this.sock = null
    this.#setStatus('disconnected')
  }

  snapshot() {
    return {
      status: this.status,
      connected: this.connected,
      qr: this.status === 'qr' ? this.qrDataUrl : null,
      me: this.me ? { id: this.me.id, name: this.me.name ?? null } : null,
      lastError: this.lastError,
    }
  }
}

export const whatsapp = new WhatsAppClient()

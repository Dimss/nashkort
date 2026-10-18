import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  Browsers,
} from '@whiskeysockets/baileys'
import QRCode from 'qrcode'

// The WhatsApp Web version is fetched over the network; do it once per process
// and share it with every client instead of once per socket start.
let versionPromise = null
export function resolveWaVersion(logger) {
  if (!versionPromise) {
    versionPromise = fetchLatestBaileysVersion()
      .then((r) => r.version)
      .catch((err) => {
        logger?.warn?.({ err }, 'could not fetch latest WA version, using bundled default')
        return undefined
      })
  }
  return versionPromise
}

/**
 * One WhatsApp connection for one user: login via QR, auto-reconnect, group
 * listing and text sending. Credentials live in `authDir` and nothing else
 * ever reads or deletes that folder.
 */
export class WhatsAppClient extends EventEmitter {
  sock = null
  status = 'disconnected' // disconnected | connecting | qr | connected | logged_out
  qrDataUrl = null
  me = null
  lastError = null
  #groupCache = { at: 0, list: [] }
  #groupMeta = new Map()
  #reconnectTimer = null
  #stopped = false
  #generation = 0

  constructor({ authDir, logger, socketFactory = makeWASocket, versionProvider = null, groupCacheMs = 60_000 }) {
    super()
    if (typeof authDir !== 'string' || !authDir) throw new TypeError('WhatsAppClient needs an authDir')
    this.authDir = authDir
    this.logger = logger
    this.socketFactory = socketFactory
    this.versionProvider = versionProvider ?? (() => resolveWaVersion(logger))
    this.groupCacheMs = groupCacheMs
  }

  get connected() {
    return this.status === 'connected' && !!this.sock
  }

  // Credentials saved on disk, whether or not a socket is open right now.
  get linked() {
    return fs.existsSync(path.join(this.authDir, 'creds.json'))
  }

  async start() {
    const generation = ++this.#generation
    this.#stopped = false
    clearTimeout(this.#reconnectTimer)
    this.#setStatus('connecting')

    const { state, saveCreds } = await useMultiFileAuthState(this.authDir)
    if (generation !== this.#generation) return
    const version = await this.versionProvider()
    if (generation !== this.#generation) return

    const sock = this.socketFactory({
      version,
      logger: this.logger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, this.logger),
      },
      browser: Browsers.macOS('Desktop'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      cachedGroupMetadata: async (jid) => this.#groupMeta.get(jid),
    })
    if (generation !== this.#generation) {
      // stop() ran while we were awaiting; this socket must not live on
      try { sock.end?.(undefined) } catch {}
      return
    }
    this.sock = sock

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
      if (this.sock !== sock) return // event from a socket that was already replaced or stopped
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        try {
          this.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 })
        } catch (err) {
          this.logger?.error?.({ err }, 'failed to render QR')
        }
        this.#setStatus('qr')
      }

      if (connection === 'open') {
        this.qrDataUrl = null
        this.lastError = null
        this.me = sock.user ?? null
        this.#setStatus('connected')
        this.logger?.info?.({ me: this.me }, 'WhatsApp connected')
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode
        const loggedOut = statusCode === DisconnectReason.loggedOut
        this.lastError = lastDisconnect?.error?.message ?? null
        this.sock = null
        this.qrDataUrl = null
        this.me = null

        if (loggedOut) {
          this.logger?.warn?.('logged out from WhatsApp; clearing credentials')
          this.#setStatus('logged_out')
          fs.rmSync(this.authDir, { recursive: true, force: true })
          if (!this.#stopped) this.#scheduleReconnect(1000) // offer a fresh QR
        } else if (!this.#stopped) {
          this.logger?.warn?.({ statusCode, err: this.lastError }, 'connection closed; reconnecting')
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
      if (this.#stopped) return
      this.start().catch((err) => {
        this.logger?.error?.({ err }, 'reconnect failed')
        this.#scheduleReconnect(10_000)
      })
    }, delay)
    this.#reconnectTimer.unref?.()
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
    const fresh = Date.now() - this.#groupCache.at < this.groupCacheMs
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

  /** Unlink the phone: tells WhatsApp, deletes this user's credentials, then offers a fresh QR. */
  async logout() {
    this.#stopped = true
    this.#generation++
    clearTimeout(this.#reconnectTimer)
    try {
      await this.sock?.logout()
    } catch (err) {
      this.logger?.warn?.({ err }, 'logout call failed; clearing local credentials anyway')
    }
    this.sock = null
    fs.rmSync(this.authDir, { recursive: true, force: true })
    this.#groupCache = { at: 0, list: [] }
    this.#groupMeta.clear()
    this.#setStatus('logged_out')
    await this.start()
  }

  /** Pause: close the socket, keep the credentials, suppress reconnects. */
  async stop() {
    this.#stopped = true
    this.#generation++
    clearTimeout(this.#reconnectTimer)
    const sock = this.sock
    this.sock = null
    try { sock?.end?.(undefined) } catch {}
    this.qrDataUrl = null
    this.me = null
    this.#setStatus('disconnected')
  }

  snapshot() {
    return {
      status: this.status,
      connected: this.connected,
      qr: this.status === 'qr' ? this.qrDataUrl : null,
      me: this.me ? { id: this.me.id, name: this.me.name ?? null } : null,
      lastError: this.lastError,
      linked: this.linked,
    }
  }
}

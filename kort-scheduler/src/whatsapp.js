import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  Browsers,
  generateMessageIDV2,
  jidDecode,
  getContentType,
  normalizeMessageContent,
  proto,
} from '@whiskeysockets/baileys'
import QRCode from 'qrcode'

// Content that is not a chat message of its own.
const NOT_A_MESSAGE = new Set(['protocolMessage', 'senderKeyDistributionMessage', 'messageContextInfo', 'reactionMessage', 'pollUpdateMessage'])

// Seconds since the epoch as Baileys gives them (a number or a protobuf Long), in ms.
function secondsToMs(value) {
  const n = Number(value?.toString?.() ?? value)
  return Number.isFinite(n) && n > 0 ? n * 1000 : null
}

// Who sent `m`, as WhatsApp shows it: their profile name, or else their number.
function senderOf(m) {
  if (m.key?.fromMe) return null
  if (m.pushName) return m.pushName
  const jid = m.key?.participantAlt ?? m.key?.participant ?? ''
  return jidDecode(jid)?.user ?? (jid || null)
}

// The message's text, or its kind in brackets (`[image]`) when it has none.
// Null for content that is not a message.
function summarize(m) {
  if (!m.message) return m.messageStubType === proto.WebMessageInfo.StubType.CIPHERTEXT ? { text: null, undecrypted: true } : null
  const content = normalizeMessageContent(m.message)
  const type = getContentType(content)
  if (!type || NOT_A_MESSAGE.has(type)) return null
  const body = type === 'conversation' ? content.conversation : (content[type]?.text ?? content[type]?.caption)
  const text = typeof body === 'string' && body ? body : `[${type.replace(/Message$/, '')}]`
  return { text, undecrypted: false }
}

let versionPromise = null
// Saved credentials for one user's link live in this file inside their folder.
export function hasCredentials(authDir) {
  return fs.existsSync(path.join(authDir, 'creds.json'))
}

// Fetched over the network, so once per process and shared by every client.
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

/** One WhatsApp connection for one user: login via QR, auto-reconnect, group listing and text sending. */
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
  #acks = new Map() // message id -> callback, for sends waiting on the server's ack
  #writes = new Map() // message id -> when Baileys wrote its stanza to the socket
  #socketLogger

  constructor({ authDir, logger, socketFactory = makeWASocket, versionProvider = null, groupCacheMs = 60_000 }) {
    super()
    if (typeof authDir !== 'string' || !authDir) throw new TypeError('WhatsAppClient needs an authDir')
    this.authDir = authDir
    this.logger = logger
    this.socketFactory = socketFactory
    this.versionProvider = versionProvider ?? (() => resolveWaVersion(logger))
    this.groupCacheMs = groupCacheMs
    // Baileys logs 'sending message to N devices' with the message id right before it
    // writes the stanza, and the write follows synchronously, so that call is the write time.
    const base = logger ?? {}
    // Writable, so pino's child() can set its own level methods on loggers derived from it.
    this.#socketLogger = Object.create(base, {
      debug: {
        writable: true,
        configurable: true,
        value: (obj, msg, ...rest) => {
          if (obj?.msgId && typeof msg === 'string' && msg.startsWith('sending message to')) this.#writes.set(obj.msgId, Date.now())
          return base.debug?.(obj, msg, ...rest)
        },
      },
    })
  }

  get connected() {
    return this.status === 'connected' && !!this.sock
  }

  get linked() {
    return hasCredentials(this.authDir)
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
      logger: this.#socketLogger,
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
      try { sock.end?.(undefined) } catch {}
      return
    }
    this.sock = sock

    sock.ev.on('creds.update', saveCreds)

    // The server acknowledges every message it accepts with an ack node carrying the message id.
    sock.ws?.on?.('CB:ack,class:message', (node) => {
      const done = this.#acks.get(node?.attrs?.id)
      if (done) done(Date.now(), node.attrs.error ?? null, secondsToMs(node.attrs.t))
    })

    // Every group chat message, as a 'group-message' event (jid, entry) with WhatsApp's
    // own time. Our own sends echo back here with the local clock's time instead, so
    // theirs comes from the server's ack (see sendText).
    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (this.sock !== sock || (type !== 'notify' && type !== 'append')) return
      for (const m of messages ?? []) {
        const jid = m.key?.remoteJid
        if (!jid?.endsWith('@g.us') || !m.key.id) continue
        const summary = summarize(m)
        if (!summary) continue
        const own = m.key.fromMe && type === 'append'
        this.emit('group-message', jid, {
          id: m.key.id,
          fromMe: !!m.key.fromMe,
          sender: senderOf(m),
          serverTime: own ? null : secondsToMs(m.messageTimestamp),
          ...summary,
        })
      }
    })

    sock.ev.on('connection.update', async (update) => {
      if (this.sock !== sock) return
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
          if (!this.#stopped) this.#scheduleReconnect(1000)
        } else if (!this.#stopped) {
          this.logger?.warn?.({ statusCode, err: this.lastError }, 'connection closed; reconnecting')
          this.#setStatus('disconnected')
          this.#scheduleReconnect(3000)
        } else {
          this.#setStatus('disconnected')
        }
      }
    })

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

  // Does the network work of a group send ahead of time, so the send itself is local
  // encryption plus one socket write: fresh group metadata (the member list), every
  // member's device list (Baileys caches it for 5 minutes) and a Signal session with each
  // device that has not yet received our sender key for this group.
  async prepareGroupSend(jid) {
    if (!this.connected) throw new Error('WhatsApp is not connected')
    const sock = this.sock
    const meta = await sock.groupMetadata(jid)
    this.#groupMeta.set(jid, meta)
    const devices = await sock.getUSyncDevices(meta.participants.map((p) => p.id), false, false)
    const memory = (await sock.authState.keys.get('sender-key-memory', [jid]))[jid] ?? {}
    // Same exclusions as Baileys' group send: hosted devices and device 99 get no sender key.
    const needSession = devices
      .filter((d) => d.device !== 99 && !jidDecode(d.jid)?.server?.startsWith('hosted'))
      .map((d) => d.jid)
      .filter((deviceJid) => !memory[deviceJid])
    if (needSession.length) await sock.assertSessions(needSession)
    // Loads our sender key for the group into Baileys' key cache, so encrypting reads no file.
    const me = sock.authState.creds?.me
    for (const id of [me?.lid, me?.id]) if (id) await sock.signalRepository?.hasSenderKey?.({ group: jid, meId: id })
    return { participants: meta.participants.length, devices: devices.length, newSessions: needSession.length }
  }

  // Resolves once the socket write is done. `ack` resolves with the time the server
  // acknowledged the message, or null after `ackTimeoutMs`.
  async sendText(jid, text, { ackTimeoutMs = 10_000 } = {}) {
    if (!this.connected) throw new Error('WhatsApp is not connected')
    const messageId = generateMessageIDV2(this.sock.user?.id)
    const ack = new Promise((resolve) => {
      const timer = setTimeout(() => { this.#acks.delete(messageId); resolve(null) }, ackTimeoutMs)
      timer.unref?.()
      this.#acks.set(messageId, (at, error, serverTime) => {
        clearTimeout(timer)
        this.#acks.delete(messageId)
        if (at != null && serverTime != null) this.emit('group-message', jid, { id: messageId, fromMe: true, serverTime })
        resolve(at == null ? null : { at, error, serverTime })
      })
    })
    try {
      // linkPreview: null skips Baileys' URL fetch for a preview, which would run before the send.
      await this.sock.sendMessage(jid, { text, linkPreview: null }, { messageId })
    } catch (err) {
      this.#writes.delete(messageId)
      this.#acks.get(messageId)?.(null, null, null)
      throw err
    }
    const doneAt = Date.now()
    const writtenAt = this.#writes.get(messageId) ?? null
    this.#writes.delete(messageId)
    this.emit('group-message', jid, { id: messageId, fromMe: true, text })
    return { messageId, writtenAt, doneAt, ack }
  }

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

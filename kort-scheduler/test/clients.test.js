import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { freshData } from './helpers/tempdata.js'

let env, config, WhatsAppClient, createRegistry

// A socket double: records handlers, lets a test drive connection events.
function fakeSocket() {
  const handlers = {}
  return {
    ev: { on: (name, fn) => { (handlers[name] ??= []).push(fn) } },
    handlers,
    ended: false,
    end() { this.ended = true },
    async logout() {},
    user: { id: '1@s.whatsapp.net', name: 'Tester' },
    emit(name, payload) { for (const fn of handlers[name] ?? []) fn(payload) },
  }
}

function makeRegistry(overrides = {}) {
  const sockets = new Map()
  const contexts = []
  const registry = createRegistry({
    makeClient(userId) {
      const logger = { child: (b) => ({ ...b, info() {}, warn() {}, error() {}, debug() {}, trace() {}, level: 'silent' }) }.child({ userId })
      contexts.push(logger)
      const client = new WhatsAppClient({
        authDir: config.authDirFor(userId),
        logger,
        versionProvider: async () => [2, 3000, 0],
        socketFactory: overrides.socketFactory ?? (() => { const s = fakeSocket(); sockets.set(userId, s); return s }),
      })
      return client
    },
    staggerMs: 0,
    ...overrides.registry,
  })
  return { registry, sockets, contexts }
}

const tick = () => new Promise((r) => setTimeout(r, 20))

before(async () => {
  env = await freshData()
  ;({ config } = await env.load('config.js'))
  ;({ WhatsAppClient } = await env.load('whatsapp.js'))
  ;({ createRegistry } = await env.load('clients.js'))
})
after(() => env.cleanup())

test('two users get two clients with their own credential folders and logger contexts', async () => {
  const { registry, contexts } = makeRegistry()
  const a = registry.ensure(1), b = registry.ensure(2)
  await tick()
  assert.notEqual(a, b)
  assert.equal(a.authDir, config.authDirFor(1))
  assert.equal(b.authDir, config.authDirFor(2))
  assert.deepEqual(contexts.map((c) => c.userId), [1, 2])
  await registry.stopAll()
})

test('stop during an in-flight start leaves no live socket and the registry reports idle', async () => {
  let release
  const gate = new Promise((r) => { release = r })
  const made = []
  const { registry } = makeRegistry({ socketFactory: () => { const s = fakeSocket(); made.push(s); return s } })
  // make the version provider wait so stop() lands mid-start
  const client = new WhatsAppClient({ authDir: config.authDirFor(3), logger: { child: () => ({}) , info() {}, warn() {}, error() {} }, versionProvider: () => gate.then(() => [2, 3000, 0]), socketFactory: () => { const s = fakeSocket(); made.push(s); return s } })
  const starting = client.start()
  await client.stop()
  release()
  await starting
  assert.equal(client.sock, null)
  assert.equal(client.status, 'disconnected')
  assert.ok(made.every((s) => s.ended), 'a socket opened by the stale start is ended')
  assert.equal(registry.snapshot(3).status, 'idle')
})

test('a client left in qr without a status poll for 5 minutes is stopped; one polled 4 minutes ago is not', async () => {
  const { registry, sockets } = makeRegistry()
  const now = Date.now()
  registry.ensure(4, now); registry.ensure(5, now)
  await tick()
  sockets.get(4).emit('connection.update', { qr: 'code-4' }); sockets.get(5).emit('connection.update', { qr: 'code-5' })
  await tick()
  assert.equal(registry.snapshot(4, now).status, 'qr')
  registry.snapshot(5, now + 60_000) // user 5 polled a minute later
  registry.sweepIdle(now + 5 * 60_000 + 1)
  assert.equal(registry.get(4), undefined)
  assert.equal(registry.snapshot(4, now + 5 * 60_000 + 1).status, 'idle')
  assert.ok(registry.get(5))
  await registry.stopAll()
})

test('a linked client caught in connecting with a stale poll survives the sweep; an unlinked one next to it is stopped', async () => {
  const { registry } = makeRegistry()
  mkdirSync(config.authDirFor(14), { recursive: true }); writeFileSync(join(config.authDirFor(14), 'creds.json'), '{}')
  const now = Date.now()
  registry.ensure(14, now); registry.ensure(15, now)
  await tick()
  assert.equal(registry.get(14).status, 'connecting')
  assert.equal(registry.get(14).linked, true)
  registry.sweepIdle(now + 10 * 60_000)
  assert.ok(registry.get(14), 'linked client kept while reconnecting')
  assert.equal(registry.get(15), undefined, 'unlinked client stopped')
  await registry.stopAll()
})

test('bootAll starts clients only for users with saved credentials', async () => {
  const { registry } = makeRegistry()
  mkdirSync(config.authDirFor(6), { recursive: true }); writeFileSync(join(config.authDirFor(6), 'creds.json'), '{}')
  mkdirSync(config.authDirFor(7), { recursive: true })
  await registry.bootAll([6, 7, 8])
  await tick()
  assert.ok(registry.get(6))
  assert.equal(registry.get(7), undefined)
  assert.equal(registry.get(8), undefined)
  assert.equal(registry.snapshot(6).linked, true)
  assert.equal(registry.snapshot(8).linked, false)
  await registry.stopAll()
})

test('a status poll from a user with no client creates and starts one', async () => {
  const { registry } = makeRegistry()
  assert.equal(registry.get(9), undefined)
  const snap = registry.snapshot(9)
  assert.equal(snap.status, 'idle')
  registry.ensure(9)
  await tick()
  assert.ok(['connecting', 'qr'].includes(registry.snapshot(9).status))
  await registry.stopAll()
})

test('a logged-out close wipes only that user\'s folder and offers a new QR', async () => {
  const { registry, sockets } = makeRegistry()
  for (const id of [10, 11]) { mkdirSync(config.authDirFor(id), { recursive: true }); writeFileSync(join(config.authDirFor(id), 'creds.json'), '{}') }
  registry.ensure(10); registry.ensure(11)
  await tick()
  sockets.get(10).emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 }, message: 'logged out' } } })
  await tick()
  assert.ok(!existsSync(join(config.authDirFor(10), 'creds.json')))
  assert.ok(existsSync(join(config.authDirFor(11), 'creds.json')))
  assert.ok(['logged_out', 'connecting', 'qr'].includes(registry.snapshot(10).status))
  await registry.stopAll()
})

test('stopAll resolves after every socket has ended', async () => {
  const { registry, sockets } = makeRegistry()
  registry.ensure(12); registry.ensure(13)
  await tick()
  await registry.stopAll()
  assert.ok([...sockets.values()].every((s) => s.ended))
  assert.equal(registry.size, 0)
})

test('a client is never constructed with a non-integer folder key', () => {
  const { registry } = makeRegistry()
  assert.throws(() => registry.ensure('12'))
  assert.throws(() => registry.ensure(0))
  assert.equal(registry.size, 0)
})

// --- exact-time sends -------------------------------------------------------

// A connected client over a socket double that records sends and answers the
// group-send lookups from fixed data.
async function connectedClient(userId, sockOver = {}) {
  const { EventEmitter } = await import('node:events')
  const sock = Object.assign(fakeSocket(), { ws: new EventEmitter(), sends: [], ...sockOver })
  sock.sendMessage ??= async (jid, content, options) => { sock.sends.push({ jid, content, options }) }
  const silent = { info() {}, warn() {}, error() {}, debug() {}, trace() {}, child() { return silent }, level: 'silent' }
  const client = new WhatsAppClient({ authDir: config.authDirFor(userId), logger: silent, versionProvider: async () => [2, 3000, 0], socketFactory: () => sock })
  await client.start()
  sock.emit('connection.update', { connection: 'open' })
  return { client, sock }
}

test('a text goes out without a link preview, under its own message id, and its ack resolves when the server acknowledges that id', async () => {
  const { client, sock } = await connectedClient(20)
  const { messageId, ack } = await client.sendText('g@g.us', 'see https://example.com')
  assert.equal(sock.sends.length, 1)
  assert.deepEqual(sock.sends[0].content, { text: 'see https://example.com', linkPreview: null })
  assert.equal(sock.sends[0].options.messageId, messageId)
  sock.ws.emit('CB:ack,class:message', { attrs: { id: 'someone-else', from: 'g@g.us' } })
  const before = Date.now()
  sock.ws.emit('CB:ack,class:message', { attrs: { id: messageId, from: 'g@g.us' } })
  const result = await ack
  assert.ok(result.at >= before)
  assert.equal(result.error, null)
  await client.stop()
})

test('an ack that never comes resolves as null after the timeout', async () => {
  const { client } = await connectedClient(21)
  const { ack } = await client.sendText('g@g.us', 'hi', { ackTimeoutMs: 20 })
  assert.equal(await ack, null)
  await client.stop()
})

test('preparing a group send fetches members and devices and opens sessions only for devices without our sender key', async () => {
  const calls = { usync: [], sessions: [] }
  const { client } = await connectedClient(22, {
    groupMetadata: async (jid) => ({ id: jid, participants: [{ id: 'a@lid' }, { id: 'b@lid' }] }),
    getUSyncDevices: async (jids, useCache) => {
      calls.usync.push({ jids, useCache })
      return [
        { user: 'a', device: 0, jid: 'a@lid' },
        { user: 'a', device: 2, jid: 'a:2@lid' },
        { user: 'b', device: 0, jid: 'b@lid' },
        { user: 'b', device: 99, jid: 'b:99@lid' },
        { user: 'h', device: 0, jid: 'h@hosted.lid' },
      ]
    },
    authState: { keys: { get: async (type, ids) => ({ [ids[0]]: type === 'sender-key-memory' ? { 'a@lid': true } : undefined }) } },
    assertSessions: async (jids) => { calls.sessions.push(jids) },
  })
  const r = await client.prepareGroupSend('g@g.us')
  assert.deepEqual(calls.usync, [{ jids: ['a@lid', 'b@lid'], useCache: false }], 'device lists are fetched fresh')
  assert.deepEqual(calls.sessions, [['a:2@lid', 'b@lid']])
  assert.deepEqual(r, { participants: 2, devices: 5, newSessions: 2 })
  await client.stop()
})

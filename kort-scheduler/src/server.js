import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { authenticate, login, logout } from './auth.js'
import { messages, sessions } from './db.js'
import { REPEAT_RULES } from './recurrence.js'
import { clients } from './clients.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MAX_MESSAGE_LENGTH = 4096
const SESSION_COOKIE = 'session'
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days, matches auth.js

function getCookie(req, name) {
  const header = req.headers.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim())
  }
  return null
}

function currentSession(req) {
  return authenticate(getCookie(req, SESSION_COOKIE))
}

export function createApp() {
  sessions.pruneExpired()

  const app = express()
  app.use(express.json({ limit: '64kb' }))

  // Gate the app shell itself: unauthenticated visitors get the login page.
  app.get(['/', '/index.html'], (req, res, next) => {
    if (!currentSession(req)) return res.redirect('/login.html')
    next()
  })
  app.use(express.static(path.join(__dirname, '..', 'public')))

  app.post('/api/login', (req, res) => {
    const { email, password } = req.body ?? {}
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' })
    }
    const token = login(email.trim().toLowerCase(), password)
    if (!token) return res.status(401).json({ error: 'Invalid email or password.' })
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_MS,
      path: '/',
    })
    res.json({ ok: true })
  })

  app.post('/api/auth/logout', (req, res) => {
    logout(getCookie(req, SESSION_COOKIE))
    res.clearCookie(SESSION_COOKIE, { path: '/' })
    res.json({ ok: true })
  })

  // Everything else under /api requires a valid session.
  app.use('/api', (req, res, next) => {
    const session = currentSession(req)
    if (!session) return res.status(401).json({ error: 'Authentication required.' })
    req.user = session
    next()
  })

  app.get('/api/status', (req, res) => {
    clients.ensure(req.user.user_id)
    res.json({ ...clients.snapshot(req.user.user_id), serverTime: Date.now() })
  })

  app.get('/api/groups', async (req, res, next) => {
    const client = clients.get(req.user.user_id)
    if (!client?.connected) return res.status(503).json({ error: 'WhatsApp is not connected' })
    try {
      const force = req.query.refresh === '1'
      res.json(await client.listGroups({ force }))
    } catch (err) {
      next(err)
    }
  })

  app.get('/api/messages', (req, res) => {
    res.json(messages.list(req.user.user_id))
  })

  app.post('/api/messages', (req, res) => {
    const { groupJid, groupName, message, sendAt, repeat } = req.body ?? {}
    const text = typeof message === 'string' ? message.trim() : ''
    const when = Number(sendAt)
    const repeatRule = repeat === undefined || repeat === null || repeat === '' ? 'none' : repeat

    if (typeof groupJid !== 'string' || !groupJid.endsWith('@g.us')) {
      return res.status(400).json({ error: 'Please choose a group.' })
    }
    if (!text) return res.status(400).json({ error: 'Message cannot be empty.' })
    if (text.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).` })
    }
    if (!Number.isFinite(when)) return res.status(400).json({ error: 'Invalid date/time.' })
    if (when < Date.now() - 60_000) {
      return res.status(400).json({ error: 'The scheduled time is in the past.' })
    }
    if (!REPEAT_RULES.has(repeatRule)) return res.status(400).json({ error: 'Invalid repeat option.' })

    const row = messages.create({
      ownerId: req.user.user_id,
      groupJid,
      groupName: typeof groupName === 'string' ? groupName : null,
      message: text,
      sendAt: when,
      repeat: repeatRule,
    })
    res.status(201).json(row)
  })

  app.post('/api/messages/:id/cancel', (req, res) => {
    const id = Number(req.params.id)
    const owner = req.user.user_id
    if (!messages.get(id, owner)) return res.status(404).json({ error: 'Message not found.' })
    if (!messages.cancel(id, owner)) {
      return res.status(409).json({ error: 'Only pending messages can be cancelled.' })
    }
    res.json(messages.get(id, owner))
  })

  app.delete('/api/messages/:id', (req, res) => {
    const id = Number(req.params.id)
    const owner = req.user.user_id
    if (!messages.get(id, owner)) return res.status(404).json({ error: 'Message not found.' })
    if (!messages.delete(id, owner)) {
      return res.status(409).json({ error: 'Message is being sent right now.' })
    }
    res.status(204).end()
  })

  app.post('/api/logout', async (req, res, next) => {
    try {
      const client = clients.ensure(req.user.user_id)
      await client.logout()
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err)
    res.status(500).json({ error: err?.message ?? 'Internal error' })
  })

  return app
}

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { config, normalizeEmail } from './config.js'
import { messages, sessions, users, transaction } from './db.js'
import { REPEAT_RULES } from './recurrence.js'
import { clients } from './clients.js'
import { createOidc, EMAIL_NOT_VERIFIED, SUBJECT_PREFIXES, CALLBACK_PATH } from './oidc.js'
import { accounts as defaultAccounts } from './accounts.js'
import {
  getCookie, readSession, createSession, setSessionCookie, clearSessionCookie, destroySession,
  setSignInCookie, readSignInCookie, clearSignInCookie,
} from './session.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.join(__dirname, '..', 'public')
const MAX_MESSAGE_LENGTH = 4096
const LOGIN_PATH = '/auth/login'
const LOGOUT_PATH = '/auth/logout'
const LANGS = new Set(['ru', 'en'])
const CSP = "default-src 'self'; frame-ancestors 'none'; img-src 'self' data:"
const ACCOUNT_PAGE = fs.readFileSync(path.join(PUBLIC_DIR, 'account.html'), 'utf8')

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function page({ lang, title, ru, en, state, signInAgain }) {
  const safeLang = LANGS.has(lang) ? lang : 'ru'
  const link = signInAgain
    ? `<p><a href="${LOGIN_PATH}?lang=${safeLang}">Войти снова / Sign in again</a></p>`
    : ''
  return `<!DOCTYPE html>
<html lang="${safeLang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/styles.css"></head>
<body class="state-page"${state ? ` data-state="${escapeHtml(state)}"` : ''}>
<main><section class="card">
<p lang="ru">${escapeHtml(ru)}</p>
<p lang="en">${escapeHtml(en)}</p>
${link}
</section></main>
</body>
</html>`
}

function sendGenericErrorPage(res, lang) {
  res.status(400).type('html').send(page({
    lang,
    title: 'Ошибка входа / Sign-in error',
    ru: 'Не удалось выполнить вход. Попробуйте ещё раз.',
    en: 'Sign-in did not complete. Please try again.',
    signInAgain: true,
  }))
}

function sendConfirmEmailPage(res, lang) {
  res.status(403).type('html').send(page({
    lang,
    title: 'Подтвердите почту / Confirm your email',
    ru: 'Подтвердите адрес электронной почты по ссылке из письма, затем войдите снова.',
    en: 'Please confirm your email address using the link we sent you, then sign in again.',
    signInAgain: true,
  }))
}

function sendStatePage(res, state) {
  // Only this allowlisted token is injected, never anything about the person.
  const token = state === 'pending' ? 'pending' : 'disabled'
  res.status(200).type('html').send(ACCOUNT_PAGE.replace('data-state=""', `data-state="${token}"`))
}

function pickLang(req) {
  const q = req.query?.lang
  if (typeof q === 'string' && LANGS.has(q)) return q
  const c = getCookie(req, 'lang')
  if (c && LANGS.has(c)) return c
  return 'ru'
}

// State-changing requests must come from the app's own origin.
function sameOrigin(req) {
  const origin = req.headers.origin
  if (origin !== undefined) return origin === config.baseUrl
  const site = req.headers['sec-fetch-site']
  return site === undefined || site === 'same-origin' || site === 'none'
}

// Never prints tokens, claims or configuration.
function logAuthFailure(stage, err) {
  const parts = [err?.name, err?.code, err?.message].filter(Boolean)
  console.error(`[auth] ${stage} failed: ${parts.join(' ') || 'unknown error'}`)
}

// A refused callback names the check that refused it, never a token or a claim value.
function logAuthRefusal(reason) {
  console.warn(`[auth] callback refused: ${String(reason).replace(/[\r\n]+/g, ' ').slice(0, 200)}`)
}

// By subject; else adopt a subject-less row by email; else insert pending.
// A different subject for a taken email is refused.
function resolveAccount(sub, email) {
  return transaction(() => {
    let user = users.findBySub(sub) ?? users.adoptByEmail(email, sub)
    if (!user) {
      if (users.findByEmail(email)) return null
      user = users.insertPending({ email, sub })
    }
    users.touchSignIn(user.id, email)
    return users.get(user.id)
  })
}

function isAdmin(session) {
  return session.state === 'approved' && normalizeEmail(session.email) === config.adminEmail
}

export function createApp({ fetch: fetchImpl, oidc, accounts = defaultAccounts } = {}) {
  sessions.pruneExpired()
  setInterval(() => sessions.pruneExpired(), 60 * 60 * 1000).unref()

  const auth0 = config.auth0
  const provider = oidc ?? createOidc({
    issuer: `https://${auth0.domain}`,
    clientId: auth0.clientId,
    clientSecret: auth0.clientSecret,
    baseUrl: config.baseUrl,
    fetch: fetchImpl,
  })

  const app = express()
  app.set('trust proxy', 1)
  app.disable('x-powered-by')
  app.use(express.json({ limit: '64kb' }))

  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', CSP)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'same-origin')
    res.setHeader('X-Frame-Options', 'DENY')
    if (config.baseUrl.startsWith('https://')) res.setHeader('Strict-Transport-Security', 'max-age=31536000')
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Cross-site request refused.' })
    next()
  })

  app.get(LOGIN_PATH, async (req, res) => {
    const lang = pickLang(req)
    try {
      const { url, state, nonce, verifier } = await provider.beginLogin({ lang })
      setSignInCookie(res, { state, nonce, verifier, lang })
      res.redirect(302, url)
    } catch (err) {
      logAuthFailure('login', err)
      clearSignInCookie(res)
      sendGenericErrorPage(res, lang)
    }
  })

  app.get(CALLBACK_PATH, async (req, res) => {
    const pending = readSignInCookie(req)
    clearSignInCookie(res)
    const lang = LANGS.has(pending?.lang) ? pending.lang : pickLang(req)

    // The state cookie is checked before anything else, on both branches.
    const state = req.query.state
    if (!pending) {
      logAuthRefusal('no sign-in cookie (expired, blocked, or the flow started on another host)')
      return sendGenericErrorPage(res, lang)
    }
    if (typeof state !== 'string' || state !== pending.state) {
      logAuthRefusal('state mismatch')
      return sendGenericErrorPage(res, lang)
    }

    if (req.query.error !== undefined) {
      if (req.query.error_description === EMAIL_NOT_VERIFIED) return sendConfirmEmailPage(res, lang)
      logAuthRefusal(`provider error ${req.query.error}: ${req.query.error_description ?? ''}`)
      return sendGenericErrorPage(res, lang)
    }

    let claims
    try {
      ;({ claims } = await provider.completeLogin(new URL(req.originalUrl, config.baseUrl), pending))
    } catch (err) {
      logAuthFailure('callback', err)
      return sendGenericErrorPage(res, lang)
    }

    const sub = claims.sub
    const email = normalizeEmail(typeof claims.email === 'string' ? claims.email : '')
    if (typeof sub !== 'string' || !SUBJECT_PREFIXES.some((p) => sub.startsWith(p))) {
      logAuthRefusal(`subject from connection "${typeof sub === 'string' ? sub.split('|')[0] : typeof sub}" is not accepted`)
      return sendGenericErrorPage(res, lang)
    }
    if (!email) {
      logAuthRefusal('no email claim')
      return sendGenericErrorPage(res, lang)
    }
    if (claims.email_verified !== true) return sendConfirmEmailPage(res, lang)

    let user
    try {
      user = resolveAccount(sub, email)
    } catch (err) {
      logAuthFailure('account lookup', err)
      return sendGenericErrorPage(res, lang)
    }
    if (!user) {
      logAuthRefusal('email already linked to a different subject')
      return sendGenericErrorPage(res, lang)
    }

    const hint = typeof claims.sid === 'string' ? claims.sid : null
    setSessionCookie(res, createSession(user.id, hint))
    res.redirect(302, '/')
  })

  app.post(LOGOUT_PATH, async (req, res) => {
    const session = destroySession(req)
    clearSessionCookie(res)
    let url
    try {
      url = await provider.logoutUrl(session?.sid ?? null)
    } catch (err) {
      logAuthFailure('logout', err)
      url = '/'
    }
    res.redirect(303, url)
  })

  app.get(['/', '/index.html'], (req, res) => {
    const session = readSession(req)
    if (!session) return res.redirect(302, LOGIN_PATH)
    if (session.state === 'approved') return res.sendFile(path.join(PUBLIC_DIR, 'index.html'))
    sendStatePage(res, session.state)
  })
  app.get(['/admin', '/admin.html'], (req, res) => {
    const session = readSession(req)
    if (!session) return res.redirect(302, LOGIN_PATH)
    if (!isAdmin(session)) return res.redirect(302, '/')
    res.sendFile(path.join(PUBLIC_DIR, 'admin.html'))
  })
  app.get('/account.html', (_req, res) => res.redirect(302, '/'))
  app.use(express.static(PUBLIC_DIR, { index: false }))

  app.use('/api', (req, res, next) => {
    const session = readSession(req)
    if (!session) return res.status(401).json({ error: 'Authentication required.' })
    req.user = session
    if (req.path === '/me') return next()
    if (session.state !== 'approved') {
      return res.status(403).json({ error: `Your account is ${session.state}.`, state: session.state })
    }
    next()
  })

  app.get('/api/me', (req, res) => {
    res.json({ email: req.user.email, state: req.user.state, isAdmin: isAdmin(req.user) })
  })

  // The only routes that take an account id.
  app.use('/api/admin', (req, res, next) => {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin access required.' })
    next()
  })

  app.get('/api/admin/users', (_req, res) => {
    res.json(accounts.list())
  })

  const ACTIONS = new Set(['approve', 'reject', 'disable', 'enable'])
  app.post('/api/admin/users/:id/:action', (req, res, next) => {
    const action = req.params.action
    if (!ACTIONS.has(action)) return res.status(404).json({ error: 'Unknown action.' })
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Account not found.' })
    try {
      const row = accounts[action](id, req.user.user_id)
      if (!row) return res.status(404).json({ error: 'Account not found.' })
      res.json(row)
    } catch (err) {
      if (err?.status === 409) return res.status(409).json({ error: err.message })
      next(err)
    }
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

  // Unlinks the caller's WhatsApp account (not the app sign-out, which is POST /auth/logout).
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
    const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500
    console.error(err)
    if (res.headersSent) return
    // Only errors that carry an explicit 4xx and are meant for clients (body parser) show their text.
    const message = status < 500 && err?.expose && typeof err.message === 'string' ? err.message : 'Internal error'
    res.status(status).json({ error: message })
  })

  return app
}

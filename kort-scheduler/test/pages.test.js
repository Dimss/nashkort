import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { freshData } from './helpers/tempdata.js'
import { createFakeIssuer, startApp, request, signIn, beginLogin } from './helpers/fake-issuer.js'

const ADMIN = 'admin@example.com'
process.env.ADMIN_EMAIL = ADMIN
process.env.BASE_URL = 'http://app.local'
process.env.AUTH0_DOMAIN = 'fake-issuer.example'
process.env.AUTH0_CLIENT_ID = 'test-client'
process.env.AUTH0_CLIENT_SECRET = 'test-secret'

const CSP = "default-src 'self'; frame-ancestors 'none'; img-src 'self' data:"
let env, issuer, srv, users
const verified = (sub, email) => ({ sub, email, email_verified: true })
const asUser = (s) => ({ cookies: { [s.name]: s.value } })

function assertStrictHtml(res, label) {
  assert.match(res.headers.get('content-type') ?? '', /text\/html/, `${label} is html`)
  assert.equal(res.headers.get('content-security-policy'), CSP, `${label} carries the policy`)
  assert.doesNotMatch(res.text, /<script(?![^>]*\bsrc=)/i, `${label} has no inline script`)
  assert.doesNotMatch(res.text, /<style[\s>]/i, `${label} has no style element`)
  assert.doesNotMatch(res.text, /\sstyle=/i, `${label} has no style attribute`)
}

before(async () => {
  env = await freshData()
  issuer = createFakeIssuer()
  ;({ users } = await env.load('db.js'))
  const { bootstrap } = await env.load('bootstrap.js')
  bootstrap()
  const { createApp } = await env.load('server.js')
  srv = await startApp(createApp({ fetch: issuer.fetch }))
})
after(async () => { await srv?.close(); env?.cleanup() })

test('anonymous GET of the admin page redirects to login; an approved non-admin is sent to /', async () => {
  const anon = await request(srv.origin, '/admin')
  assert.equal(anon.status, 302)
  assert.equal(anon.location, '/auth/login')
  const { session } = await signIn(srv.origin, issuer, verified('auth0|user', 'user@example.com'))
  users.setState(users.findBySub('auth0|user').id, 'approved')
  const r = await request(srv.origin, '/admin', asUser(session))
  assert.equal(r.status, 302)
  assert.equal(r.location, '/')
})

test('the admin gets the admin page; it is strict html with navigation back to the schedule', async () => {
  const { session } = await signIn(srv.origin, issuer, verified('auth0|admin', ADMIN))
  const r = await request(srv.origin, '/admin', asUser(session))
  assert.equal(r.status, 200)
  assertStrictHtml(r, 'admin page')
  assert.match(r.text, /href="\/"/)
  assert.match(r.text, /action="\/auth\/logout"/)
  assert.match(r.text, /id="langSwitch"/)
})

test('a pending user gets the account page with the waiting token and no email in the markup', async () => {
  const { session } = await signIn(srv.origin, issuer, verified('auth0|pend', 'pend-secret@example.com'))
  const r = await request(srv.origin, '/', asUser(session))
  assert.equal(r.status, 200)
  assertStrictHtml(r, 'waiting page')
  assert.match(r.text, /data-state="pending"/)
  assert.doesNotMatch(r.text, /pend-secret@example\.com/)
  assert.match(r.text, /action="\/auth\/logout"/)
  // AE1: the API refuses with the state and nothing else
  const api = await request(srv.origin, '/api/messages', asUser(session))
  assert.equal(api.status, 403)
  assert.deepEqual(Object.keys(api.json()).sort(), ['error', 'state'])
  assert.equal(api.json().state, 'pending')
  // /api/me tracks approval on the same cookie
  const me1 = await request(srv.origin, '/api/me', asUser(session))
  assert.equal(me1.status, 200); assert.equal(me1.json().state, 'pending')
  users.setState(users.findBySub('auth0|pend').id, 'approved')
  const me2 = await request(srv.origin, '/api/me', asUser(session))
  assert.equal(me2.json().state, 'approved')
})

test('a disabled user gets the account page with the disabled token', async () => {
  const { session } = await signIn(srv.origin, issuer, verified('auth0|dis', 'dis@example.com'))
  users.setState(users.findBySub('auth0|dis').id, 'disabled')
  const r = await request(srv.origin, '/', asUser(session))
  assertStrictHtml(r, 'disabled page')
  assert.match(r.text, /data-state="disabled"/)
})

test('the app shell, the confirm-email page and the generic error page are strict html too', async () => {
  const { session } = await signIn(srv.origin, issuer, verified('auth0|ok', 'ok@example.com'))
  users.setState(users.findBySub('auth0|ok').id, 'approved')
  const shell = await request(srv.origin, '/', asUser(session))
  assert.equal(shell.status, 200)
  assertStrictHtml(shell, 'app shell')
  assert.match(shell.text, /src="\/app\.js"/)
  assert.match(shell.text, /href="\/styles\.css"/)
  const { authParams, signInCookie } = await beginLogin(srv.origin, issuer)
  const confirm = await request(srv.origin, `/auth/callback?${new URLSearchParams({ error: 'access_denied', error_description: 'email_not_verified', state: authParams.state })}`, { cookies: { [signInCookie.name]: signInCookie.value } })
  assertStrictHtml(confirm, 'confirm page')
  const generic = await request(srv.origin, '/auth/callback?error=server_error&state=nope')
  assertStrictHtml(generic, 'generic error page')
  for (const asset of ['/app.js', '/styles.css', '/account.js', '/admin.js', '/i18n.js']) {
    const a = await request(srv.origin, asset)
    assert.equal(a.status, 200, `${asset} is served`)
  }
})

test('the page scripts translate every server error string the pages can receive', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
  const mainPageErrors = [
    'WhatsApp is not connected', 'Please choose a group.', 'Message cannot be empty.',
    'Message is too long (max 4096 characters).', 'Invalid date/time.', 'The scheduled time is in the past.',
    'Only pending messages can be cancelled.', 'Message not found.', 'Message is being sent right now.',
    'Invalid repeat option.', 'Internal error', 'Cross-site request refused.',
  ]
  for (const s of mainPageErrors) assert.ok(app.includes(`'${s}'`), `app.js maps "${s}"`)
  const admin = readFileSync(new URL('../public/admin.js', import.meta.url), 'utf8')
  for (const s of ['Admin access required.', 'Account not found.', 'You cannot change your own account.', 'Internal error', 'Cross-site request refused.']) {
    assert.ok(admin.includes(`'${s}'`), `admin.js maps "${s}"`)
  }
  assert.match(app, /stMissed/, 'the main page knows the missed status')
})

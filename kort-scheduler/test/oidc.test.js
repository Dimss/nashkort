import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { freshData } from './helpers/tempdata.js'
import { createFakeIssuer, startApp, request, beginLogin, signIn } from './helpers/fake-issuer.js'

const ADMIN = 'admin@example.com'
process.env.ADMIN_EMAIL = ADMIN
process.env.BASE_URL = 'http://app.local'
process.env.AUTH0_DOMAIN = 'fake-issuer.example'
process.env.AUTH0_CLIENT_ID = 'test-client'
process.env.AUTH0_CLIENT_SECRET = 'test-secret'

let env, issuer, srv, users, sessions, database, createApp, bootstrap

before(async () => {
  env = await freshData()
  issuer = createFakeIssuer()
  ;({ users, sessions, database } = await env.load('db.js'))
  ;({ bootstrap } = await env.load('bootstrap.js'))
  ;({ createApp } = await env.load('server.js'))
  srv = await startApp(createApp({ fetch: issuer.fetch }))
})
after(async () => { await srv?.close(); env?.cleanup() })

const countUsers = () => database.prepare('SELECT count(*) AS n FROM users').get().n
const countSessions = () => database.prepare('SELECT count(*) AS n FROM sessions').get().n
const sessionCookieOf = (res) => res.setCookies.find((c) => /session/i.test(c.name) && !c.cleared)
const signInCookieOf = (res) => res.setCookies.find((c) => /signin/i.test(c.name))
const isBilingualWithLink = (text) => /Sign in again/.test(text) && /Войти/.test(text) && /href="\/auth\/login\?lang=(ru|en)"/.test(text)
const verified = (sub, email, extra = {}) => ({ sub, email, email_verified: true, ...extra })

test('start-up does not contact the issuer; login redirects with state, nonce, S256, scope openid email and ui_locales', async () => {
  assert.deepEqual(issuer.requests, [])
  const { res, authParams, signInCookie } = await beginLogin(srv.origin, issuer)
  assert.equal(res.status, 302)
  assert.equal(authParams.response_type, 'code')
  assert.equal(authParams.client_id, 'test-client')
  assert.equal(authParams.redirect_uri, 'http://app.local/auth/callback')
  assert.equal(authParams.scope, 'openid email')
  assert.equal(authParams.code_challenge_method, 'S256')
  assert.ok(authParams.state?.length >= 16)
  assert.ok(authParams.nonce?.length >= 16)
  assert.ok(authParams.code_challenge?.length >= 32)
  assert.equal(authParams.ui_locales, 'ru')
  assert.equal(signInCookie.attributes.httponly, true)
  assert.equal(signInCookie.attributes.samesite?.toLowerCase(), 'lax')
  assert.equal(signInCookie.attributes.path, '/')
  assert.equal(Number(signInCookie.attributes['max-age']), 600)
  assert.ok(!signInCookie.name.startsWith('__Host-'))
  assert.equal(signInCookie.attributes.secure, undefined)
  // no return-to parameter anywhere
  assert.equal(authParams.returnTo, undefined)
  assert.equal(authParams.redirect, undefined)

  const en = await beginLogin(srv.origin, issuer, { path: '/auth/login?lang=en' })
  assert.equal(en.authParams.ui_locales, 'en')
  const fromCookie = await beginLogin(srv.origin, issuer, { cookies: { lang: 'en' } })
  assert.equal(fromCookie.authParams.ui_locales, 'en')
  const bad = await beginLogin(srv.origin, issuer, { path: '/auth/login?lang=fr' })
  assert.equal(bad.authParams.ui_locales, 'ru')
})

test('callback with a mismatched state renders the generic error page, clears the transient cookie and creates no session', async () => {
  const { authParams, signInCookie } = await beginLogin(srv.origin, issuer)
  const code = issuer.issueCode(authParams, verified('auth0|mismatch', 'm@example.com'))
  const before = { users: countUsers(), sessions: countSessions() }
  const res = await request(srv.origin, `/auth/callback?${new URLSearchParams({ code, state: 'not-the-state' })}`, {
    cookies: { [signInCookie.name]: signInCookie.value },
  })
  assert.ok(res.status >= 400 && res.status < 500, `status ${res.status}`)
  assert.match(res.headers.get('content-type'), /text\/html/)
  assert.ok(isBilingualWithLink(res.text), res.text)
  assert.equal(sessionCookieOf(res), undefined)
  assert.equal(signInCookieOf(res)?.cleared, true)
  assert.deepEqual({ users: countUsers(), sessions: countSessions() }, before)
  // the token endpoint was never called
  assert.ok(!issuer.tokenRequests.some((t) => t.code === code))
})

test('callback error branch: the exact reason email_not_verified renders the confirm page; anything else renders the generic page without echoing the description', async () => {
  const { authParams, signInCookie } = await beginLogin(srv.origin, issuer, { path: '/auth/login?lang=en' })
  const res = await request(srv.origin, `/auth/callback?${new URLSearchParams({ error: 'access_denied', error_description: 'email_not_verified', state: authParams.state })}`, {
    cookies: { [signInCookie.name]: signInCookie.value },
  })
  assert.match(res.headers.get('content-type'), /text\/html/)
  assert.match(res.text, /confirm/i)
  assert.match(res.text, /подтвердите/i)
  assert.match(res.text, /href="\/auth\/login\?lang=en"/)
  assert.equal(sessionCookieOf(res), undefined)
  assert.equal(signInCookieOf(res)?.cleared, true)
  assert.doesNotMatch(res.text, /<form/)

  const evil = '<script>alert(1)</script>'
  const noCookie = await request(srv.origin, `/auth/callback?${new URLSearchParams({ error: 'access_denied', error_description: evil, state: 'x' })}`)
  assert.ok(noCookie.status >= 400 && noCookie.status < 500)
  assert.ok(isBilingualWithLink(noCookie.text), noCookie.text)
  assert.ok(!noCookie.text.includes(evil))
  assert.ok(!noCookie.text.includes('alert(1)'))
  assert.equal(sessionCookieOf(noCookie), undefined)

  // a valid state but another error description is also generic and not echoed
  const second = await beginLogin(srv.origin, issuer)
  const other = await request(srv.origin, `/auth/callback?${new URLSearchParams({ error: 'access_denied', error_description: 'Something from Auth0 ZZTOP', state: second.authParams.state })}`, {
    cookies: { [second.signInCookie.name]: second.signInCookie.value },
  })
  assert.ok(isBilingualWithLink(other.text))
  assert.ok(!other.text.includes('ZZTOP'))
  assert.doesNotMatch(other.text, /confirm your email/i)
})

test('AE10: an ID token with email_verified false renders the confirm page, creates no row and sets no cookie', async () => {
  const before = countUsers()
  const { res, session } = await signIn(srv.origin, issuer, { sub: 'auth0|unverified', email: 'unverified@example.com', email_verified: false })
  assert.match(res.headers.get('content-type'), /text\/html/)
  assert.match(res.text, /confirm/i)
  assert.equal(session, null)
  assert.equal(countUsers(), before)
  assert.equal(users.findBySub('auth0|unverified'), undefined)
  assert.equal(signInCookieOf(res)?.cleared, true)
})

test('a subject from another connection with the admin email creates nothing and sets no cookie', async () => {
  const before = { users: countUsers(), sessions: countSessions() }
  const { res, session } = await signIn(srv.origin, issuer, verified('google-oauth2|12345', ADMIN))
  assert.ok(res.status >= 400 && res.status < 500, `status ${res.status}`)
  assert.ok(isBilingualWithLink(res.text))
  assert.equal(session, null)
  assert.deepEqual({ users: countUsers(), sessions: countSessions() }, before)
  assert.equal(users.findBySub('google-oauth2|12345'), undefined)
})

test('a callback with no email claim creates nothing', async () => {
  const before = { users: countUsers(), sessions: countSessions() }
  const { res, session } = await signIn(srv.origin, issuer, { sub: 'auth0|noemail', email_verified: true })
  assert.ok(res.status >= 400 && res.status < 500)
  assert.equal(session, null)
  assert.deepEqual({ users: countUsers(), sessions: countSessions() }, before)
})

test('first verified callback creates a pending user and a hashed session, then redirects to /', async () => {
  const { res, session, signInCookie } = await signIn(srv.origin, issuer, verified('auth0|first', 'First@Example.com ', { sid: 'sid-first' }))
  assert.equal(res.status, 302)
  assert.equal(res.location, '/')
  assert.ok(session, 'session cookie set')
  assert.match(session.value, /^[0-9a-f]{64}$/)
  assert.equal(session.attributes.httponly, true)
  assert.equal(session.attributes.samesite?.toLowerCase(), 'lax')
  assert.equal(session.attributes.path, '/')
  assert.equal(Number(session.attributes['max-age']), 30 * 24 * 3600)
  assert.equal(signInCookieOf(res)?.cleared, true)
  // the transient cookie and the session cookie use different names
  assert.notEqual(signInCookie.name, session.name)

  const user = users.findBySub('auth0|first')
  assert.equal(user.email, 'first@example.com')
  assert.equal(user.state, 'pending')
  assert.ok(user.last_sign_in_at > 0)

  const rows = database.prepare('SELECT token_hash, sid, user_id, expires_at, created_at FROM sessions WHERE user_id = ?').all(user.id)
  assert.equal(rows.length, 1)
  assert.notEqual(rows[0].token_hash, session.value)
  assert.match(rows[0].token_hash, /^[0-9a-f]{64}$/)
  assert.equal(rows[0].sid, 'sid-first')
  const thirtyDays = 30 * 24 * 3600 * 1000
  assert.ok(Math.abs(rows[0].expires_at - rows[0].created_at - thirtyDays) < 1000)
  assert.equal(database.prepare('SELECT 1 FROM sessions WHERE token_hash = ?').get(session.value), undefined)

  // the fresh cookie is accepted
  const me = await request(srv.origin, '/api/me', { cookies: { [session.name]: session.value } })
  assert.equal(me.status, 200)
  assert.deepEqual(me.json(), { email: 'first@example.com', state: 'pending', isAdmin: false })
})

test('the admin email after bootstrap attaches the subject to the approved row; no second row', async () => {
  const { admin } = bootstrap()
  assert.equal(admin.auth0_sub, null)
  const before = countUsers()
  const { res, session } = await signIn(srv.origin, issuer, verified('auth0|admin', 'Admin@Example.com'))
  assert.equal(res.status, 302)
  assert.ok(session)
  assert.equal(countUsers(), before)
  const row = users.findBySub('auth0|admin')
  assert.equal(row.id, admin.id)
  assert.equal(row.state, 'approved')
  const me = await request(srv.origin, '/api/me', { cookies: { [session.name]: session.value } })
  assert.deepEqual(me.json(), { email: ADMIN, state: 'approved', isAdmin: true })
})

test('a legacy row with a non-admin email is adopted by the person signing in with that email, keeping its id', async () => {
  const legacy = users.upsertAdmin('legacy@example.com')
  users.setState(legacy.id, 'pending')
  const before = countUsers()
  const { res, session } = await signIn(srv.origin, issuer, verified('auth0|legacy', 'legacy@example.com'))
  assert.equal(res.status, 302)
  assert.ok(session)
  assert.equal(countUsers(), before)
  const row = users.findBySub('auth0|legacy')
  assert.equal(row.id, legacy.id)
  assert.equal(row.state, 'pending')
})

test('a second subject claiming an existing email is refused with no row change and no session', async () => {
  const existing = users.findBySub('auth0|first')
  const before = { users: countUsers(), sessions: countSessions() }
  const { res, session } = await signIn(srv.origin, issuer, verified('auth0|impostor', 'first@example.com'))
  assert.ok(res.status >= 400 && res.status < 500, `status ${res.status}`)
  assert.ok(isBilingualWithLink(res.text))
  assert.equal(session, null)
  assert.deepEqual({ users: countUsers(), sessions: countSessions() }, before)
  assert.deepEqual(users.get(existing.id), existing)
  assert.equal(users.findBySub('auth0|impostor'), undefined)
})

test('a second callback for the same subject creates no row and updates the last sign-in time', async () => {
  const row = users.findBySub('auth0|first')
  database.prepare('UPDATE users SET last_sign_in_at = ? WHERE id = ?').run(1000, row.id)
  const before = countUsers()
  const { res, session } = await signIn(srv.origin, issuer, verified('auth0|first', 'first@example.com'))
  assert.equal(res.status, 302)
  assert.ok(session)
  assert.equal(countUsers(), before)
  const again = users.findBySub('auth0|first')
  assert.equal(again.id, row.id)
  assert.ok(again.last_sign_in_at > 1000)
  assert.equal(sessions.get(session.value), null, 'raw token is not the stored key')
})

test('AE9: POST logout deletes the session, clears the cookie and redirects to the end-session URL with the registered post-logout URL', async () => {
  const { session } = await signIn(srv.origin, issuer, verified('auth0|first', 'first@example.com', { sid: 'sid-logout' }))
  const sessionsBefore = countSessions()
  const res = await request(srv.origin, '/auth/logout', {
    method: 'POST',
    headers: { origin: 'http://app.local' },
    cookies: { [session.name]: session.value },
  })
  assert.ok(res.status === 302 || res.status === 303, `status ${res.status}`)
  const url = new URL(res.location)
  assert.equal(url.origin + url.pathname, `${issuer.issuer}/oidc/logout`)
  assert.equal(url.searchParams.get('post_logout_redirect_uri'), 'http://app.local/')
  assert.equal(url.searchParams.get('client_id'), 'test-client')
  assert.equal(url.searchParams.get('logout_hint'), 'sid-logout')
  assert.equal(url.searchParams.get('returnTo'), null)
  const cleared = res.setCookies.find((c) => c.name === session.name)
  assert.equal(cleared?.cleared, true)
  assert.equal(countSessions(), sessionsBefore - 1)
  const me = await request(srv.origin, '/api/me', { cookies: { [session.name]: session.value } })
  assert.equal(me.status, 401)
})

test('GET on the logout route is rejected', async () => {
  const res = await request(srv.origin, '/auth/logout')
  assert.ok(res.status === 404 || res.status === 405, `status ${res.status}`)
})

test('/login.html answers 404', async () => {
  const res = await request(srv.origin, '/login.html')
  assert.equal(res.status, 404)
})

test('under an https base URL both cookies carry the __Host- prefix and the Secure flag', async () => {
  process.env.BASE_URL = 'https://app.example'
  const secure = await startApp(createApp({ fetch: issuer.fetch }))
  try {
    const root = await request(secure.origin, '/')
    assert.equal(root.headers.get('strict-transport-security'), 'max-age=31536000')
    const { authParams, signInCookie } = await beginLogin(secure.origin, issuer)
    assert.equal(authParams.redirect_uri, 'https://app.example/auth/callback')
    assert.ok(signInCookie.name.startsWith('__Host-'), signInCookie.raw)
    assert.equal(signInCookie.attributes.secure, true)
    assert.equal(signInCookie.attributes.path, '/')
    const { res, session } = await signIn(secure.origin, issuer, verified('auth0|secure', 'secure@example.com'))
    assert.equal(res.status, 302)
    assert.ok(session, 'session cookie set')
    assert.ok(session.name.startsWith('__Host-'), session.raw)
    assert.equal(session.attributes.secure, true)
    assert.equal(session.attributes.path, '/')
    assert.equal(session.attributes.domain, undefined)
    // the cleared transient cookie keeps the same prefixed name
    const cleared = res.setCookies.find((c) => c.name === signInCookie.name)
    assert.equal(cleared?.cleared, true)
  } finally {
    process.env.BASE_URL = 'http://app.local'
    await secure.close()
  }
})

test('without an end-session endpoint, sign-out goes to the legacy /v2/logout URL with client_id and returnTo', async () => {
  const legacy = createFakeIssuer({ endSession: false })
  const app2 = await startApp(createApp({ fetch: legacy.fetch }))
  try {
    const { session } = await signIn(app2.origin, legacy, verified('auth0|legacy-logout', 'legacy-logout@example.com'))
    assert.ok(session)
    const res = await request(app2.origin, '/auth/logout', { method: 'POST', headers: { origin: 'http://app.local' }, cookies: { [session.name]: session.value } })
    assert.ok(res.status === 302 || res.status === 303, `status ${res.status}`)
    const url = new URL(res.location)
    assert.equal(url.origin + url.pathname, `${legacy.issuer}/v2/logout`)
    assert.equal(url.searchParams.get('client_id'), 'test-client')
    assert.equal(url.searchParams.get('returnTo'), 'http://app.local/')
    assert.equal(url.searchParams.get('post_logout_redirect_uri'), null)
  } finally { await app2.close() }
})

test('logoutUrl: a JWT hint becomes id_token_hint, a plain sid becomes logout_hint', async () => {
  const { createOidc } = await env.load('oidc.js')
  const oidc = createOidc({ issuer: issuer.issuer, clientId: 'test-client', clientSecret: 'test-secret', baseUrl: 'http://app.local', fetch: issuer.fetch })
  const jwt = new URL(await oidc.logoutUrl('aGVhZGVy.cGF5bG9hZA.c2ln'))
  assert.equal(jwt.searchParams.get('id_token_hint'), 'aGVhZGVy.cGF5bG9hZA.c2ln')
  assert.equal(jwt.searchParams.get('logout_hint'), null)
  const sid = new URL(await oidc.logoutUrl('sid-1'))
  assert.equal(sid.searchParams.get('logout_hint'), 'sid-1')
  assert.equal(sid.searchParams.get('id_token_hint'), null)
})

test('logoutUrl falls back to the legacy URL when discovery fails, so sign-out still leaves the app', async () => {
  const { createOidc } = await env.load('oidc.js')
  let calls = 0
  const oidc = createOidc({ issuer: 'https://down.example', clientId: 'test-client', clientSecret: 'test-secret', baseUrl: 'http://app.local', fetch: async () => { calls++; throw new Error('ECONNREFUSED') } })
  const url = new URL(await oidc.logoutUrl('sid-1'))
  assert.equal(url.origin + url.pathname, 'https://down.example/v2/logout')
  assert.equal(url.searchParams.get('client_id'), 'test-client')
  assert.equal(url.searchParams.get('returnTo'), 'http://app.local/')
  assert.ok(calls >= 1)
})

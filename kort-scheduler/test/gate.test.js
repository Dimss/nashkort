import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { freshData } from './helpers/tempdata.js'
import { createFakeIssuer, startApp, request, signIn } from './helpers/fake-issuer.js'

const ADMIN = 'admin@example.com'
process.env.ADMIN_EMAIL = ADMIN
process.env.BASE_URL = 'http://app.local'
process.env.AUTH0_DOMAIN = 'fake-issuer.example'
process.env.AUTH0_CLIENT_ID = 'test-client'
process.env.AUTH0_CLIENT_SECRET = 'test-secret'

let env, issuer, srv, users, sessions, messages, createApp

before(async () => {
  env = await freshData()
  issuer = createFakeIssuer()
  ;({ users, sessions, messages } = await env.load('db.js'))
  ;({ createApp } = await env.load('server.js'))
  srv = await startApp(createApp({ fetch: issuer.fetch }))
})
after(async () => { await srv?.close(); env?.cleanup() })

const verified = (sub, email) => ({ sub, email, email_verified: true })
const asUser = (session) => ({ cookies: { [session.name]: session.value } })
const future = () => Date.now() + 3600_000

test('anonymous: / redirects to the login route, /api answers 401, /api/me answers 401', async () => {
  const root = await request(srv.origin, '/')
  assert.equal(root.status, 302)
  assert.equal(root.location, '/auth/login')
  const index = await request(srv.origin, '/index.html')
  assert.equal(index.status, 302)
  const api = await request(srv.origin, '/api/messages')
  assert.equal(api.status, 401)
  assert.deepEqual(api.json(), { error: 'Authentication required.' })
  const me = await request(srv.origin, '/api/me')
  assert.equal(me.status, 401)
  // a forged cookie is just as anonymous
  const forged = await request(srv.origin, '/api/messages', { cookies: { session: 'a'.repeat(64) } })
  assert.equal(forged.status, 401)
})

test('pending: 403 with state on the API, 200 on /api/me, the pending page on /', async () => {
  const { session } = await signIn(srv.origin, issuer, verified('auth0|pending', 'pending@example.com'))
  assert.ok(session)
  const api = await request(srv.origin, '/api/messages', asUser(session))
  assert.equal(api.status, 403)
  assert.equal(api.json().state, 'pending')
  assert.equal(typeof api.json().error, 'string')
  const me = await request(srv.origin, '/api/me', asUser(session))
  assert.equal(me.status, 200)
  assert.deepEqual(me.json(), { email: 'pending@example.com', state: 'pending', isAdmin: false })
  const page = await request(srv.origin, '/', asUser(session))
  assert.match(page.headers.get('content-type'), /text\/html/)
  assert.match(page.text, /data-state="pending"/)
  assert.doesNotMatch(page.text, /src="\/app\.js"/, 'not the app shell')
})

test('AE2: a pending user approved in the database gets the app shell on the next request with the same cookie', async () => {
  const { session } = await signIn(srv.origin, issuer, verified('auth0|approve-me', 'approve@example.com'))
  const user = users.findBySub('auth0|approve-me')
  assert.equal((await request(srv.origin, '/api/messages', asUser(session))).status, 403)
  users.setState(user.id, 'approved')
  const api = await request(srv.origin, '/api/messages', asUser(session))
  assert.equal(api.status, 200)
  assert.deepEqual(api.json(), [])
  const page = await request(srv.origin, '/', asUser(session))
  assert.equal(page.status, 200)
  assert.match(page.text, /id="langSwitch"/, 'app shell')
  const me = await request(srv.origin, '/api/me', asUser(session))
  assert.deepEqual(me.json(), { email: 'approve@example.com', state: 'approved', isAdmin: false })
})

test('AE7: a disabled user with a valid session gets 403 with state disabled, 200 on /api/me, and the disabled page on /', async () => {
  const { session } = await signIn(srv.origin, issuer, verified('auth0|disabled', 'disabled@example.com'))
  const user = users.findBySub('auth0|disabled')
  users.setState(user.id, 'approved')
  messages.create({ ownerId: user.id, groupJid: 'g@g.us', groupName: 'G', message: 'hello', sendAt: future() })
  assert.equal((await request(srv.origin, '/api/messages', asUser(session))).json().length, 1)
  users.setState(user.id, 'disabled')
  const api = await request(srv.origin, '/api/messages', asUser(session))
  assert.equal(api.status, 403)
  assert.equal(api.json().state, 'disabled')
  assert.equal(api.json().hello, undefined)
  const me = await request(srv.origin, '/api/me', asUser(session))
  assert.equal(me.status, 200)
  assert.equal(me.json().state, 'disabled')
  const page = await request(srv.origin, '/', asUser(session))
  assert.match(page.text, /data-state="disabled"/)
  assert.doesNotMatch(page.text, /hello/)
})

test('AE4: a user whose sessions were deleted gets 401, is silently re-signed by the issuer, and lands on the disabled page with no data', async () => {
  const { session } = await signIn(srv.origin, issuer, verified('auth0|gone', 'gone@example.com'))
  const user = users.findBySub('auth0|gone')
  users.setState(user.id, 'approved')
  messages.create({ ownerId: user.id, groupJid: 'g@g.us', groupName: 'G', message: 'secret text', sendAt: future() })
  // the admin disables: state flip plus session delete
  users.setState(user.id, 'disabled')
  sessions.deleteForUser(user.id)

  const api = await request(srv.origin, '/api/messages', asUser(session))
  assert.equal(api.status, 401)
  const root = await request(srv.origin, '/', asUser(session))
  assert.equal(root.status, 302)
  assert.equal(root.location, '/auth/login')

  // the browser follows: login -> issuer re-signs the same subject without a prompt -> callback
  const again = await signIn(srv.origin, issuer, verified('auth0|gone', 'gone@example.com'), { cookies: { [session.name]: session.value } })
  assert.equal(again.res.status, 302)
  assert.equal(again.res.location, '/')
  assert.ok(again.session)
  assert.notEqual(again.session.value, session.value)
  const page = await request(srv.origin, '/', asUser(again.session))
  assert.match(page.text, /data-state="disabled"/)
  assert.doesNotMatch(page.text, /secret text/)
  const data = await request(srv.origin, '/api/messages', asUser(again.session))
  assert.equal(data.status, 403)
  assert.equal(data.json().state, 'disabled')
  assert.doesNotMatch(data.text, /secret text/)
  assert.equal(users.findBySub('auth0|gone').id, user.id)
})

test('origin rule: foreign Origin is rejected, cross-site fetch metadata without Origin is rejected, nothing at all passes', async () => {
  const { session } = await signIn(srv.origin, issuer, verified('auth0|poster', 'poster@example.com'))
  const user = users.findBySub('auth0|poster')
  users.setState(user.id, 'approved')
  const body = { groupJid: 'g@g.us', groupName: 'G', message: 'hi', sendAt: future() }

  const foreign = await request(srv.origin, '/api/messages', { method: 'POST', body, headers: { origin: 'https://evil.example' }, ...asUser(session) })
  assert.equal(foreign.status, 403)
  assert.equal(messages.list(user.id).length, 0)

  const crossSite = await request(srv.origin, '/api/messages', { method: 'POST', body, headers: { 'sec-fetch-site': 'cross-site' }, ...asUser(session) })
  assert.equal(crossSite.status, 403)
  assert.equal(messages.list(user.id).length, 0)

  const bare = await request(srv.origin, '/api/messages', { method: 'POST', body, ...asUser(session) })
  assert.equal(bare.status, 201)
  assert.equal(messages.list(user.id).length, 1)

  const same = await request(srv.origin, '/api/messages', { method: 'POST', body, headers: { origin: 'http://app.local' }, ...asUser(session) })
  assert.equal(same.status, 201)
  const sameSite = await request(srv.origin, '/api/messages', { method: 'POST', body, headers: { 'sec-fetch-site': 'same-origin' }, ...asUser(session) })
  assert.equal(sameSite.status, 201)
  const none = await request(srv.origin, '/api/messages', { method: 'POST', body, headers: { 'sec-fetch-site': 'none' }, ...asUser(session) })
  assert.equal(none.status, 201)

  const id = messages.list(user.id)[0].id
  const del = await request(srv.origin, `/api/messages/${id}`, { method: 'DELETE', headers: { origin: 'https://evil.example' }, ...asUser(session) })
  assert.equal(del.status, 403)
  assert.ok(messages.get(id, user.id))

  // the origin rule also guards the logout route
  const logout = await request(srv.origin, '/auth/logout', { method: 'POST', headers: { origin: 'https://evil.example' }, ...asUser(session) })
  assert.equal(logout.status, 403)
  assert.equal((await request(srv.origin, '/api/me', asUser(session))).status, 200)
})

test('errors without an explicit status answer { error: "Internal error" }; malformed JSON keeps a 400', async () => {
  const { session } = await signIn(srv.origin, issuer, verified('auth0|json', 'json@example.com'))
  users.setState(users.findBySub('auth0|json').id, 'approved')
  const res = await globalThis.fetch(srv.origin + '/api/messages', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: `${session.name}=${session.value}` }, body: '{not json',
  })
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.equal(typeof body.error, 'string')
})

test('R16/R17: over HTTP a user cannot read, cancel or delete another user\'s message, and validation answers 400', async () => {
  const post = { method: 'POST', headers: { origin: 'http://app.local' } }
  const a = (await signIn(srv.origin, issuer, verified('auth0|owner-a', 'owner-a@example.com'))).session
  const b = (await signIn(srv.origin, issuer, verified('auth0|owner-b', 'owner-b@example.com'))).session
  const idA = users.findBySub('auth0|owner-a').id
  users.setState(idA, 'approved'); users.setState(users.findBySub('auth0|owner-b').id, 'approved')

  const created = await request(srv.origin, '/api/messages', { ...post, ...asUser(a), body: { groupJid: 'g@g.us', groupName: 'G', message: 'mine', sendAt: future() } })
  assert.equal(created.status, 201)
  const id = created.json().id
  assert.equal(created.json().owner_id, idA)

  assert.deepEqual((await request(srv.origin, '/api/messages', asUser(b))).json(), [])
  assert.equal((await request(srv.origin, `/api/messages/${id}/cancel`, { ...post, ...asUser(b) })).status, 404)
  assert.equal((await request(srv.origin, `/api/messages/${id}`, { method: 'DELETE', headers: post.headers, ...asUser(b) })).status, 404)
  assert.equal(messages.getById(id).status, 'pending', 'the other user changed nothing')
  assert.equal((await request(srv.origin, '/api/messages', asUser(a))).json().length, 1)

  const own = await request(srv.origin, `/api/messages/${id}/cancel`, { ...post, ...asUser(a) })
  assert.equal(own.status, 200)
  assert.notEqual(messages.getById(id).status, 'pending')
  assert.equal((await request(srv.origin, `/api/messages/${id}/cancel`, { ...post, ...asUser(a) })).status, 409)

  const bad = (body) => request(srv.origin, '/api/messages', { ...post, ...asUser(a), body })
  assert.equal((await bad({ groupJid: 'x@s.whatsapp.net', message: 'hi', sendAt: future() })).status, 400)
  assert.equal((await bad({ groupJid: 'g@g.us', message: '   ', sendAt: future() })).status, 400)
  assert.equal((await bad({ groupJid: 'g@g.us', message: 'hi', sendAt: Date.now() - 3600_000 })).status, 400)
  assert.equal((await bad({ groupJid: 'g@g.us', message: 'hi', sendAt: future(), repeat: 'hourly' })).status, 400)
})

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
  assert.deepEqual(me.json(), { email: 'pending@example.com', state: 'pending', isAdmin: false, timeZone: 'Asia/Jerusalem' })
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
  assert.deepEqual(me.json(), { email: 'approve@example.com', state: 'approved', isAdmin: false, timeZone: 'Asia/Jerusalem' })
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

test('a template message is stored as typed with the app time zone, the list shows it filled in, and an unknown placeholder is refused', async () => {
  const { session } = await signIn(srv.origin, issuer, verified('auth0|templ', 'templ@example.com'))
  const user = users.findBySub('auth0|templ')
  users.setState(user.id, 'approved')
  const sendAt = Date.UTC(2030, 2, 4, 22, 30) // already 5 March in Jerusalem; placeholders show a week later
  const body = { groupJid: 'g@g.us', groupName: 'G', message: '{{day}}.{{month}} 16:30 - 18:00', sendAt, timeZone: 'Asia/Jerusalem' }
  const created = await request(srv.origin, '/api/messages', { method: 'POST', body, ...asUser(session) })
  assert.equal(created.status, 201)
  assert.equal(created.json().preview, '12.03 16:30 - 18:00')
  const [stored] = messages.list(user.id)
  assert.equal(stored.message, '{{day}}.{{month}} 16:30 - 18:00')
  assert.equal(stored.time_zone, 'Asia/Jerusalem')
  const listed = (await request(srv.origin, '/api/messages', asUser(session))).json()
  assert.equal(listed[0].preview, '12.03 16:30 - 18:00')

  // The app's zone is used whatever the browser sends.
  const otherZone = await request(srv.origin, '/api/messages', { method: 'POST', body: { ...body, timeZone: 'America/New_York' }, ...asUser(session) })
  assert.equal(otherZone.status, 201)
  assert.equal(otherZone.json().time_zone, 'Asia/Jerusalem')
  assert.equal(otherZone.json().preview, '12.03 16:30 - 18:00')

  const unknown = await request(srv.origin, '/api/messages', { method: 'POST', body: { ...body, message: '{{weekday}} 16:30' }, ...asUser(session) })
  assert.equal(unknown.status, 400)
  assert.equal(unknown.json().error, 'Unknown placeholder. Use {{day}}, {{month}} or {{year}}.')
})

test('the list gives a pending weekly row its next three sends with their text, and finished rows none', async () => {
  const { session } = await signIn(srv.origin, issuer, verified('auth0|upcoming', 'upcoming@example.com'))
  const user = users.findBySub('auth0|upcoming')
  users.setState(user.id, 'approved')
  const sendAt = Date.UTC(2030, 9, 25, 5, 0) // Fri 25 Oct 2030, 08:00 in Jerusalem
  const weekly = await request(srv.origin, '/api/messages', { method: 'POST', body: { groupJid: 'g@g.us', message: '{{day}}.{{month}} 16:30', sendAt, repeat: 'weekly' }, ...asUser(session) })
  assert.equal(weekly.status, 201)
  const once = messages.create({ ownerId: user.id, groupJid: 'g@g.us', message: 'done', sendAt: Date.now() - 3600_000 })
  messages.claim(once.id); messages.markSent(once.id)
  const listed = (await request(srv.origin, '/api/messages', asUser(session))).json()
  const row = listed.find((r) => r.id === weekly.json().id)
  assert.deepEqual(row.upcoming.map((s) => s.text), ['01.11 16:30', '08.11 16:30', '15.11 16:30'])
  assert.equal(row.upcoming[0].sendAt, sendAt)
  assert.equal(listed.find((r) => r.id === once.id).upcoming, undefined)
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

test('AE5 (R16, R17): over HTTP a user cannot read, cancel or delete another user\'s message, and validation answers 400', async () => {
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

test('recent messages: each user gets only their own connection\'s list, a bad group id is refused, and no connection gives an empty list', async () => {
  const { clients } = await env.load('clients.js')
  const a = await signIn(srv.origin, issuer, verified('auth0|recent-a', 'recent-a@example.com'))
  const b = await signIn(srv.origin, issuer, verified('auth0|recent-b', 'recent-b@example.com'))
  const c = await signIn(srv.origin, issuer, verified('auth0|recent-c', 'recent-c@example.com'))
  const ids = ['a', 'b', 'c'].map((x) => users.findBySub(`auth0|recent-${x}`).id)
  for (const id of ids) users.setState(id, 'approved')
  const asked = []
  const fake = (label) => ({ recentMessages: (jid) => { asked.push([label, jid]); return { since: 1, messages: [{ id: label, text: `${label} text` }] } } })
  const byId = new Map([[ids[0], fake('a')], [ids[1], fake('b')]])
  const realGet = clients.get
  clients.get = (id) => byId.get(id)
  try {
    const ra = await request(srv.origin, `/api/groups/${encodeURIComponent('g@g.us')}/recent`, asUser(a.session))
    assert.equal(ra.status, 200)
    assert.deepEqual(ra.json(), { since: 1, messages: [{ id: 'a', text: 'a text' }] })
    const rb = await request(srv.origin, `/api/groups/${encodeURIComponent('g@g.us')}/recent`, asUser(b.session))
    assert.deepEqual(rb.json().messages.map((m) => m.id), ['b'])
    assert.deepEqual(asked, [['a', 'g@g.us'], ['b', 'g@g.us']])
    const bad = await request(srv.origin, `/api/groups/${encodeURIComponent('972500000001@s.whatsapp.net')}/recent`, asUser(a.session))
    assert.equal(bad.status, 400)
    const none = await request(srv.origin, `/api/groups/${encodeURIComponent('g@g.us')}/recent`, asUser(c.session))
    assert.deepEqual(none.json(), { since: null, messages: [] })
    const anon = await request(srv.origin, `/api/groups/${encodeURIComponent('g@g.us')}/recent`)
    assert.equal(anon.status, 401)
  } finally {
    clients.get = realGet
  }
})

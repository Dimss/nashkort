// In-process OpenID provider for tests. It never listens on a port: the app
// receives its `fetch` function and openid-client calls that instead of the
// network, so the issuer can live at an https URL that is never dialed.
//
// Also carries the small HTTP helpers the auth tests share: starting the app
// on a random port, following one hop at a time, and reading Set-Cookie.
import { createHash, createSign, generateKeyPairSync, randomBytes } from 'node:crypto'

const b64url = (buf) => Buffer.from(buf).toString('base64url')

export const DEFAULT_ISSUER = 'https://fake-issuer.example'

export function createFakeIssuer({ issuer = DEFAULT_ISSUER, clientId = 'test-client', clientSecret = 'test-secret', endSession = true } = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const kid = 'test-key-1'
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' }
  const codes = new Map() // code -> { claims, challenge, redirectUri }
  const requests = [] // every path openid-client asked for
  const tokenRequests = [] // parsed bodies of token requests

  const metadata = () => ({
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    jwks_uri: `${issuer}/jwks`,
    ...(endSession ? { end_session_endpoint: `${issuer}/oidc/logout` } : {}),
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    scopes_supported: ['openid', 'email'],
  })

  function signIdToken(claims) {
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }))
    const payload = b64url(JSON.stringify(claims))
    const signer = createSign('sha256')
    signer.update(`${header}.${payload}`)
    return `${header}.${payload}.${b64url(signer.sign(privateKey))}`
  }

  // Parses the redirect the app produced for the login route.
  function parseAuthorizationUrl(location) {
    const url = new URL(location)
    if (url.origin + url.pathname !== `${issuer}/authorize`) throw new Error(`unexpected authorization URL ${location}`)
    return Object.fromEntries(url.searchParams.entries())
  }

  // Simulates a sign-in at Auth0: a one-time code bound to the claims the test
  // chose. `nonce` is echoed from the authorization request unless overridden.
  function issueCode(authParams, claims = {}) {
    const code = randomBytes(16).toString('hex')
    const now = Math.floor(Date.now() / 1000)
    codes.set(code, {
      challenge: authParams.code_challenge,
      redirectUri: authParams.redirect_uri,
      claims: {
        iss: issuer,
        aud: clientId,
        iat: now,
        exp: now + 300,
        nonce: authParams.nonce,
        sid: `sid-${randomBytes(4).toString('hex')}`,
        ...claims,
      },
    })
    return code
  }

  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  async function readBody(options) {
    const body = options?.body
    if (body == null) return new URLSearchParams()
    if (body instanceof URLSearchParams) return body
    if (typeof body === 'string') return new URLSearchParams(body)
    return new URLSearchParams(await new Response(body).text())
  }

  function clientAuthenticated(headers, body) {
    const auth = headers?.authorization ?? headers?.Authorization
    if (auth?.startsWith('Basic ')) {
      const [id, secret] = Buffer.from(auth.slice(6), 'base64').toString().split(':').map(decodeURIComponent)
      return id === clientId && secret === clientSecret
    }
    return body.get('client_id') === clientId && body.get('client_secret') === clientSecret
  }

  async function fetch(input, options = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url)
    requests.push(url.pathname)
    if (url.origin !== issuer) return new Response('not found', { status: 404 })
    if (url.pathname === '/.well-known/openid-configuration') return json(200, metadata())
    if (url.pathname === '/jwks') return json(200, { keys: [jwk] })
    if (url.pathname === '/oauth/token' && options.method === 'POST') {
      const body = await readBody(options)
      const headers = options.headers instanceof Headers ? Object.fromEntries(options.headers.entries()) : (options.headers ?? {})
      tokenRequests.push(Object.fromEntries(body.entries()))
      if (!clientAuthenticated(headers, body)) return json(401, { error: 'invalid_client' })
      if (body.get('grant_type') !== 'authorization_code') return json(400, { error: 'unsupported_grant_type' })
      const issued = codes.get(body.get('code'))
      codes.delete(body.get('code'))
      if (!issued) return json(400, { error: 'invalid_grant', error_description: 'unknown code' })
      if (issued.redirectUri !== body.get('redirect_uri')) return json(400, { error: 'invalid_grant', error_description: 'redirect_uri mismatch' })
      const verifier = body.get('code_verifier') ?? ''
      if (b64url(createHash('sha256').update(verifier).digest()) !== issued.challenge) {
        return json(400, { error: 'invalid_grant', error_description: 'pkce mismatch' })
      }
      return json(200, {
        access_token: randomBytes(8).toString('hex'),
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid email',
        id_token: signIdToken(issued.claims),
      })
    }
    return new Response('not found', { status: 404 })
  }

  return { issuer, clientId, clientSecret, jwk, requests, tokenRequests, fetch, parseAuthorizationUrl, issueCode, signIdToken }
}

// ---- HTTP helpers -----------------------------------------------------------

export function startApp(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r)),
      })
    })
  })
}

// One request, never following redirects. `cookies` is a map name -> value.
export async function request(origin, path, { method = 'GET', headers = {}, cookies = {}, body } = {}) {
  const h = { ...headers }
  const jar = Object.entries(cookies).filter(([, v]) => v != null)
  if (jar.length) h.cookie = jar.map(([k, v]) => `${k}=${v}`).join('; ')
  if (body !== undefined && typeof body !== 'string') {
    h['content-type'] = 'application/json'
    body = JSON.stringify(body)
  }
  const res = await globalThis.fetch(origin + path, { method, headers: h, body, redirect: 'manual' })
  const text = await res.text()
  const setCookies = parseSetCookies(res.headers.getSetCookie())
  return {
    status: res.status,
    headers: res.headers,
    location: res.headers.get('location'),
    text,
    json: () => JSON.parse(text),
    setCookies,
    // Cookies this response left in a browser jar (cleared ones map to null).
    jar: Object.fromEntries(setCookies.map((c) => [c.name, c.cleared ? null : c.value])),
  }
}

export function parseSetCookies(list) {
  return list.map((raw) => {
    const [pair, ...attrs] = raw.split(';').map((s) => s.trim())
    const eq = pair.indexOf('=')
    const name = pair.slice(0, eq)
    const value = decodeURIComponent(pair.slice(eq + 1))
    const attributes = {}
    for (const a of attrs) {
      const i = a.indexOf('=')
      if (i === -1) attributes[a.toLowerCase()] = true
      else attributes[a.slice(0, i).toLowerCase()] = a.slice(i + 1)
    }
    const maxAge = attributes['max-age'] !== undefined ? Number(attributes['max-age']) : null
    const expires = attributes.expires ? Date.parse(attributes.expires) : null
    const cleared = value === '' || maxAge === 0 || (expires !== null && expires < Date.now())
    return { name, value, attributes, cleared, raw }
  })
}

// Drives GET login and returns what a browser would hold afterwards.
export async function beginLogin(origin, issuer, { path = '/auth/login', cookies = {} } = {}) {
  const res = await request(origin, path, { cookies })
  if (res.status < 300 || res.status > 399) throw new Error(`login answered ${res.status}: ${res.text.slice(0, 200)}`)
  const authParams = issuer.parseAuthorizationUrl(res.location)
  const signIn = res.setCookies.find((c) => /signin/i.test(c.name) && !c.cleared)
  if (!signIn) throw new Error(`login set no sign-in cookie: ${JSON.stringify(res.setCookies)}`)
  return { res, authParams, signInCookie: signIn }
}

// Full round trip: login, "Auth0" signs the subject in, callback. Returns the
// callback response plus the session cookie (name and value) if one was set.
export async function signIn(origin, issuer, claims, { loginPath = '/auth/login', cookies = {} } = {}) {
  const { authParams, signInCookie } = await beginLogin(origin, issuer, { path: loginPath, cookies })
  const code = issuer.issueCode(authParams, claims)
  const cb = new URL(authParams.redirect_uri)
  const res = await request(origin, `${cb.pathname}?${new URLSearchParams({ code, state: authParams.state })}`, {
    cookies: { ...cookies, [signInCookie.name]: signInCookie.value },
  })
  const session = res.setCookies.find((c) => /session/i.test(c.name) && !c.cleared) ?? null
  return { res, session, authParams, signInCookie }
}

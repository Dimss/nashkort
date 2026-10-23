// Auth0 code flow with PKCE over openid-client. Discovery is lazy and cached so
// start-up never contacts the tenant; every URL derives from the configured base URL.
import { setTimeout as sleep } from 'node:timers/promises'
import * as client from 'openid-client'

// The fixed reason an Auth0 post-login Action sets when it denies an unverified email.
export const EMAIL_NOT_VERIFIED = 'email_not_verified'
// Subjects are accepted only from the Auth0 database connection and Google.
export const SUBJECT_PREFIXES = ['auth0|', 'google-oauth2|']
export const SCOPE = 'openid email'
export const CALLBACK_PATH = '/auth/callback'

const DISCOVERY_ATTEMPTS = 3
const DISCOVERY_RETRY_MS = [300, 1000]
const looksLikeJwt = (value) => typeof value === 'string' && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(value)

export function createOidc({ issuer, clientId, clientSecret, baseUrl, fetch: fetchImpl } = {}) {
  if (!issuer || !clientId || !clientSecret || !baseUrl) throw new TypeError('createOidc needs issuer, clientId, clientSecret and baseUrl')
  const issuerUrl = new URL(issuer)
  const redirectUri = `${baseUrl}${CALLBACK_PATH}`
  const postLogoutRedirectUri = `${baseUrl}/`
  const discoveryOptions = fetchImpl ? { [client.customFetch]: fetchImpl } : undefined

  let configPromise = null

  async function discoverWithRetry() {
    let lastErr
    for (let attempt = 0; attempt < DISCOVERY_ATTEMPTS; attempt++) {
      try {
        return await client.discovery(issuerUrl, clientId, clientSecret, undefined, discoveryOptions)
      } catch (err) {
        lastErr = err
        if (attempt < DISCOVERY_ATTEMPTS - 1) await sleep(DISCOVERY_RETRY_MS[attempt] ?? 1000)
      }
    }
    throw lastErr
  }

  function getConfig() {
    if (!configPromise) {
      configPromise = discoverWithRetry().catch((err) => {
        configPromise = null // a later request discovers again
        throw err
      })
    }
    return configPromise
  }

  // Legacy Auth0 logout, used when the discovery document names no end-session endpoint.
  function legacyLogoutUrl() {
    const url = new URL('/v2/logout', issuerUrl)
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('returnTo', postLogoutRedirectUri)
    return url
  }

  return {
    redirectUri,
    postLogoutRedirectUri,

    async beginLogin({ lang = 'ru' } = {}) {
      const cfg = await getConfig()
      const verifier = client.randomPKCECodeVerifier()
      const codeChallenge = await client.calculatePKCECodeChallenge(verifier)
      const state = client.randomState()
      const nonce = client.randomNonce()
      const url = client.buildAuthorizationUrl(cfg, {
        redirect_uri: redirectUri,
        scope: SCOPE,
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        ui_locales: lang,
      })
      return { url: url.href, state, nonce, verifier }
    },

    async completeLogin(currentUrl, { state, nonce, verifier }) {
      const cfg = await getConfig()
      const tokens = await client.authorizationCodeGrant(cfg, new URL(currentUrl), {
        pkceCodeVerifier: verifier,
        expectedState: state,
        expectedNonce: nonce,
      })
      return { claims: tokens.claims(), idToken: tokens.id_token }
    },

    // `hint` is what the session stored: the ID token's sid, or the ID token itself.
    async logoutUrl(hint) {
      let cfg
      try {
        cfg = await getConfig()
      } catch {
        return legacyLogoutUrl().href
      }
      if (!cfg.serverMetadata().end_session_endpoint) return legacyLogoutUrl().href
      const params = { post_logout_redirect_uri: postLogoutRedirectUri, client_id: clientId }
      if (looksLikeJwt(hint)) params.id_token_hint = hint
      else if (hint) params.logout_hint = hint
      return client.buildEndSessionUrl(cfg, params).href
    },
  }
}

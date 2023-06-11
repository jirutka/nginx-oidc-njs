import qs from 'querystring'

import type { RequestHandler } from '../'
import { CSRF_TOKEN_LENGTH, Cookie, Session } from '../constants'
import { assert, extractUrlPath, formatCookie, hashCsrfToken, randomString, url } from '../utils'


export const login: RequestHandler = ({ conf, log, req, send, vars }) => {
  const requestUri = vars.request_uri
  const isUriRewritten = !requestUri?.startsWith(req.uri)

  // Allow POST for internal requests only (unless conf.insecure is enabled).
  if (!isUriRewritten && req.method !== 'POST' && !conf.insecure) {
    return send(405, undefined, { Allow: 'POST always' })
  }

  const originalUri =
    req.args.original_uri ? req.args.original_uri
    : requestUri && isUriRewritten ? qs.escape(requestUri)
    : conf.cookiePath

  const csrfToken = req.variables.request_id!
  assert(csrfToken.length === CSRF_TOKEN_LENGTH,
    `request_id is expected to be ${CSRF_TOKEN_LENGTH} chars long, but got: '${csrfToken}'`)

  log.debug?.(`login: redirecting to authorization endpoint with originalUri=${originalUri}`)

  const nonce = randomString(128)

  const authorizeUrl = url(conf.authorizationEndpoint, {
    response_type: 'code',
    client_id: conf.clientId,
    redirect_uri: conf.redirectUri,
    scope: conf.scope,
    state: hashCsrfToken(csrfToken),
    nonce,
  })
  const state = `${csrfToken}:${originalUri}`
  const cookiePath = extractUrlPath(conf.redirectUri)

  // This sets the key with which the nonce will be associated.
  vars.oidc_auth_state = state
  vars[`${Session.Nonce}_new`] = nonce

  return send(303, authorizeUrl, {
    'Set-Cookie': [
      formatCookie(Cookie.State, state, 120, { ...conf, cookiePath }, 'HttpOnly'),
    ],
  })
}

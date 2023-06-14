import qs from 'querystring'

import type { RequestHandler } from '../'
import { CSRF_TOKEN_LENGTH, Cookie, Session } from '../constants'
import { formatCookie } from '../cookie'
import { assert, extractUrlPath, hashCsrfToken, randomString, url } from '../utils'


export const login: RequestHandler = ({ conf, log, req, send, vars }) => {
  const requestUri = vars.request_uri
  const isUriRewritten = !requestUri?.startsWith(req.uri)

  // Internal requests can use GET.
  if (!isUriRewritten && req.method !== 'POST') {
    return send(405, undefined, { Allow: 'POST always' })
  }

  const originalUri =
    req.args.original_uri ? req.args.original_uri
    : requestUri && isUriRewritten ? qs.escape(requestUri)
    : '/'  // XXX: parametrize?

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

  // This sets the key with which the nonce will be associated.
  vars.oidc_auth_state = state
  vars[`${Session.Nonce}_new`] = nonce

  const stateCookie = formatCookie(Cookie.State, state, {
    ...conf.cookieAttrs,
    maxAge: 120,
    path: extractUrlPath(conf.redirectUri),
    httpOnly: true,
    // The cookie needs to be read when the OIDC Provider (a different site)
    // posts an authorization code to the callback endpoint.
    sameSite: 'none',
  })

  return send(303, authorizeUrl, { 'Set-Cookie': [stateCookie] })
}

import type { RequestHandler } from '../'
import { Cookie, Session } from '../constants'
import { formatCookie } from '../cookie'
import { AuthState } from '../oauth'
import { absoluteUrl, assert, extractUrlPath, randomString, sha256, timestamp, url } from '../utils'


export const login: RequestHandler = ({ conf, log, req, send, vars }) => {
  const requestUri = vars.request_uri
  const isUriRewritten = !requestUri?.startsWith(req.uri)

  // Internal requests can use GET.
  if (!isUriRewritten && req.method !== 'POST') {
    return send(405, undefined, { Allow: 'POST always' })
  }

  const originalUri =
    req.args.original_uri ? req.args.original_uri
    : requestUri && isUriRewritten ? requestUri
    : '/'  // XXX: parametrize?

  log.debug?.(`login: redirecting to authorization endpoint with originalUri=${originalUri}`)

  const stateId = assert(vars.request_id, 'request_id is not set')
  const nonce = randomString(128)

  const authorizeUrl = url(conf.authorizationEndpoint, {
    response_type: 'code',
    client_id: conf.clientId,
    redirect_uri: absoluteUrl(conf.redirectUri, vars),
    scope: conf.scope,
    state: sha256(stateId),
    nonce,
  })

  vars[`${Session.AuthState}_new`] = AuthState.encode({
    exp: timestamp() + 120,
    url: originalUri,
    nonce,
  })

  const stateCookie = formatCookie(Cookie.StateId, stateId, {
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

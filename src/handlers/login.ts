import qs from 'querystring'

import type { RequestHandler } from '../'
import { Cookie, CSRF_TOKEN_LENGTH } from '../constants'
import { formatCookie, random, url } from '../utils'


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
  const csrfToken = random(CSRF_TOKEN_LENGTH)

  log.debug?.(`login: redirecting to authorization endpoint with originalUri=${originalUri}`)

  const authorizeUrl = url(`${conf.serverUrl}/authorize`, {
    response_type: 'code',
    client_id: conf.clientId,
    redirect_uri: conf.redirectUri,
    scope: conf.scope,
    state: csrfToken,
  })
  return send(303, authorizeUrl, {
    'Set-Cookie': [
      formatCookie(Cookie.State, `${csrfToken}:${originalUri}`, 120, conf, 'HttpOnly'),
    ],
  })
}

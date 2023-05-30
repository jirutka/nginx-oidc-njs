import type { RequestHandler } from '..'
import { Cookie, CSRF_TOKEN_LENGTH, Session } from '../constants'
import * as oauth  from '../oauth'
import { assert, extractUrlPath, formatCookie, hashCsrfToken } from '../utils'


export const callback: RequestHandler = async (ctx) => {
  const { conf, fail, getCookie, log, req, send, vars } = ctx
  const { code, error, state } = req.args

  if (!code && !error) {
    return fail(400, 'Bad Request', "Missing query parameter 'code' or 'error'.")
  }

  const storedState = getCookie(Cookie.State, true)

  const cookiePath = extractUrlPath(conf.redirectUri)
  const clearStateCookie = formatCookie(Cookie.State, '', 0, { ...conf, cookiePath }, 'HttpOnly')
  const headers: NginxHeadersOut = { 'Set-Cookie': [clearStateCookie] }

  if (!storedState || storedState.length < CSRF_TOKEN_LENGTH) {
    return fail(400, 'Invalid State', 'Missing or corrupted state cookie.', headers)
  }
  const storedCsrf = storedState.slice(0, CSRF_TOKEN_LENGTH)
  const originalUri = storedState.slice(CSRF_TOKEN_LENGTH + 1) || '/'

  if (state !== hashCsrfToken(storedCsrf)) {
    return fail(400, 'Invalid State', 'CSRF token is missing or invalid.', headers)
  }

  if (error) {
    const description = req.args.error_description
    switch (error) {
      case 'access_denied': {
        return fail(403, 'Access Denied',
          'User or OAuth 2.0 authorization server has denied the access request.', headers)
      }
      case 'server_error': {
        return fail(502, 'OAuth Server Error', description)
      }
      case 'temporarily_unavailable': {
        return fail(502, 'OAuth Server Temporarily Unavailable', description)
      }
      default: {
        return fail(500, 'OAuth Configuration Error',
          `OAuth server returned error: ${description} (${error}).`
          + ' This is most likely caused by the OAuth proxy misconfiguration.')
      }
    }
  }
  log.debug?.(`callback: requesting tokens using auth code: ${code}`)

  const tokenSet = await oauth.requestToken(ctx, 'authorization_code', code)
  log.debug?.(`callback: received access_token=${tokenSet.access_token}, refresh_token=${tokenSet.refresh_token}`)

  // NOTE: The only reason why we call verifyToken here is to get username.
  const { username } = await oauth.verifyToken(ctx, tokenSet.access_token)
  log.info?.(`callback: received tokens for user ${username}`)

  const sessionId = assert(vars.request_id, 'request_id is not set')
  vars[`${Session.RefreshToken}_new`] = tokenSet.refresh_token!

  return send(303, originalUri, {
    'Set-Cookie': [
      formatCookie(Cookie.AccessToken, tokenSet.access_token, tokenSet.expires_in - 60, conf),
      formatCookie(Cookie.SessionId, sessionId, conf.cookieMaxAge, conf, 'HttpOnly'),
      formatCookie(Cookie.Username, username, conf.cookieMaxAge, conf),
      clearStateCookie,
    ],
  })
}

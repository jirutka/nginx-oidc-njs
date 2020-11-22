import type { RequestHandler } from '..'
import { Cookie, CSRF_TOKEN_LENGTH } from '../constants'
import * as oauth  from '../oauth'
import { formatCookie } from '../utils'
import * as uuidCrypto from '../uuid-crypto'


export const callback: RequestHandler = (ctx) => {
  const { conf, fail, getCookie, log, req, send } = ctx
  const { code, error, state } = req.args

  const storedState = getCookie(Cookie.State, true)

  const clearStateCookie = formatCookie(Cookie.State, '', 0, conf, 'HttpOnly')
  const headers: NginxHeadersOut = { 'Set-Cookie': [clearStateCookie] }

  if (!code && !error) {
    return fail(400, 'Bad Request', "Missing query parameter 'code' or 'error'.")
  }
  if (!storedState || storedState.length < CSRF_TOKEN_LENGTH) {
    return fail(400, 'Invalid State', 'Missing or corrupted state cookie.', headers)
  }
  if (state.length !== CSRF_TOKEN_LENGTH || !storedState.startsWith(state)) {
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
          + 'This is most likely caused by the OAuth proxy misconfiguration.')
      }
    }
  }
  log.debug?.(`callback: requesting tokens using auth code: ${code}`)

  return oauth.requestToken(ctx, 'authorization_code', code).then(token => {
    log.debug?.(`callback: received access_token=${token.access_token}, refresh_token=${token.refresh_token}`)

    // NOTE: The only reason why we call verifyToken here is to get username.
    return oauth.verifyToken(ctx, token.access_token).then(({ user_name }) => {
      log.info?.(`callback: received tokens for user ${user_name}`)

      const originalUri = storedState.slice(CSRF_TOKEN_LENGTH + 1) || '/'
      const refreshTokenEnc = uuidCrypto.encrypt(token.refresh_token!, conf.cookieCipherKey)

      return send(303, originalUri, {
        'Set-Cookie': [
          formatCookie(Cookie.AccessToken, token.access_token, token.expires_in - 60, conf),
          formatCookie(Cookie.RefreshToken, refreshTokenEnc, conf.cookieMaxAge, conf, 'HttpOnly'),
          formatCookie(Cookie.Username, user_name, conf.cookieMaxAge, conf),
          clearStateCookie,
        ],
      })
    })
  })
}

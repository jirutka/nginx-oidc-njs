import type { RequestHandler } from '..'
import { Cookie, Session } from '../constants'
import { formatCookie, formatCookieClear } from '../cookie'
import { decodeAndValidateIdToken, validateJwtSign } from '../jwt'
import { AuthState, requestToken }  from '../oauth'
import { assert, extractUrlPath, sha256 } from '../utils'


export const callback: RequestHandler = async (ctx) => {
  const { conf, fail, getCookie, log, req, send, vars } = ctx
  const { code, error, state: argState } = req.args

  if (!code && !error) {
    return fail(400, 'Bad Request', "Missing query parameter 'code' or 'error'.")
  }

  const cookieState = getCookie(Cookie.StateId)
  if (!cookieState) {
    return fail(400, 'Invalid State', `Missing ${Cookie.StateId} cookie.`)
  }

  const clearStateCookie = formatCookieClear(Cookie.StateId, {
    ...conf.cookieAttrs,
    path: extractUrlPath(conf.redirectUri),
  })
  const headers: NginxHeadersOut = { 'Set-Cookie': [clearStateCookie] }

  if (argState !== sha256(cookieState)) {
    return fail(400, 'Invalid State', 'The state parameter is missing or invalid.', headers)
  }

  const sessionState = vars[Session.AuthState]
  if (!sessionState) {
    return fail(400, 'Invalid State',
      'No stored state and nonce was found for this authorization response:'
      + ' it either expired or has been already used (replay attack).', headers)
  }
  vars[Session.AuthState] = undefined

  const state = AuthState.decode(sessionState)

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

  const tokenSet = await requestToken(ctx, 'authorization_code', code)
  log.debug?.(`callback: received id_token=${tokenSet.id_token}`)
  log.debug?.(`callback: received access_token=${tokenSet.access_token}`)
  log.debug?.(`callback: received refresh_token=${tokenSet.refresh_token}`)

  await validateJwtSign(ctx, tokenSet.id_token)
  const { nonce, username } = await decodeAndValidateIdToken(conf, tokenSet.id_token)

  if (nonce !== state.nonce) {
    return fail(400, 'Invalid Nonce',
      'Nonce from the ID token does not match the nonce associated with the state cookie:'
      + ` '${nonce}' != '${state.nonce}'.`)
  }

  log.info?.(`callback: creating session for user ${username}`)

  const sessionId = assert(vars.request_id, 'request_id is not set')
  vars[`${Session.AccessToken}_new`] = tokenSet.access_token
  vars[`${Session.IdToken}_new`] = tokenSet.id_token
  vars[`${Session.RefreshToken}_new`] = tokenSet.refresh_token!

  return send(303, state.url, {
    'Set-Cookie': [
      formatCookie(Cookie.SessionId, sessionId, { ...conf.cookieAttrs, httpOnly: true }),
      formatCookie(Cookie.Username, username, conf.cookieAttrs),
      clearStateCookie,
    ],
  })
}

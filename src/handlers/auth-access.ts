import type { RequestHandler } from '..'
import { authorizeAccess, isAnonymousAllowed } from '../access'
import { Cookie, Session } from '../constants'
import { decodeAndValidateIdToken } from '../jwt'
import { refreshTokens } from '../oauth'


export const auth_access: RequestHandler = async (ctx) => {
  const { conf, getCookie, log, send, vars } = ctx
  ctx.handlerType = 'auth_request'

  const idTokenJwt = vars[Session.IdToken]
  if (idTokenJwt) {
    log.debug?.(`authorize: validating id token: ${idTokenJwt}`)

    const idToken = await decodeAndValidateIdToken(conf, idTokenJwt).catch(err => {
      log.warn?.(`authorize: invalid or malformed ID token: ${err.detail ?? err.message}`)
      vars[Session.IdToken] = undefined
    })
    if (idToken) {
      return authorizeAccess(ctx, idToken, conf)
    }
  }

  const refreshToken = vars[Session.RefreshToken]
  if (refreshToken) {
    log.info?.(`authorize: refreshing token for user ${getCookie(Cookie.Username)}`)
    const { idToken } = await refreshTokens(ctx, refreshToken)

    return authorizeAccess(ctx, idToken, conf)
  }

  if (isAnonymousAllowed(conf)) {
    log.debug?.('authorize: access granted to unauthenticated user')
    return send(204)

  } else {
    log.info?.('authorize: no token found, redirecting to authorization endpoint')
    return send(401, undefined, {
      'WWW-Authenticate': 'Bearer error="unauthorized"',
    })
  }
}

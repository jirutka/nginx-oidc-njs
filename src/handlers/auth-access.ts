import type { RequestHandler } from '..'
import { Cookie, Session } from '../constants'
import { decodeAndValidateJwtClaims, idTokenUsername, validateJwtSign } from '../jwt'
import * as oauth from '../oauth'


export const auth_access: RequestHandler = async (ctx) => {
  const { conf, getCookie, log, send, vars } = ctx
  ctx.handlerType = 'auth_request'

  const idToken = vars[Session.IdToken]
  if (idToken) {
    log.debug?.(`authorize: validating id token: ${idToken}`)

    const claims = await decodeAndValidateJwtClaims(conf, idToken).catch(err => {
      log.warn?.(`authorize: invalid or malformed ID token: ${err.detail ?? err.message}`)
      vars[Session.IdToken] = undefined
    })
    if (claims) {
      log.info?.(`authorize: access granted to user ${idTokenUsername(claims)}`)
      return send(204)
    }
  }

  const refreshToken = vars[Session.RefreshToken]
  if (refreshToken) {
    log.info?.(`authorize: refreshing token for user ${getCookie(Cookie.Username)}`)
    const tokenSet = await oauth.refreshToken(ctx, refreshToken)

    log.debug?.(`authorize: token refreshed, got id token: ${tokenSet.id_token}`)
    await validateJwtSign(ctx, tokenSet.id_token)
    await decodeAndValidateJwtClaims(conf, tokenSet.id_token)

    vars[Session.AccessToken] = tokenSet.access_token
    vars[Session.IdToken] = tokenSet.id_token

    return send(204)
  }

  if (conf.accessAllowAnonymous) {
    log.debug?.('authorize: access granted to unauthenticated user')
    return send(204)

  } else {
    log.info?.('authorize: no token found, redirecting to authorization endpoint')
    return send(401, undefined, {
      'WWW-Authenticate': 'Bearer error="unauthorized"',
    })
  }
}

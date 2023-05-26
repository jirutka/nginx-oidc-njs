import type { RequestHandler } from '..'
import { Cookie } from '../constants'
import * as oauth from '../oauth'
import { formatCookie } from '../utils'


export const auth_access: RequestHandler = async (ctx) => {
  const { conf, getCookie, log, send } = ctx
  ctx.handlerType = 'auth_request'

  const accessToken = oauth.getRequestAccessToken(ctx)
  const refreshToken = getCookie(Cookie.RefreshToken)

  if (accessToken) {
    log.debug?.(`authorize: verifying access token: ${accessToken}`)
    const { username } = await oauth.verifyToken(ctx, accessToken)

    log.info?.(`authorize: access granted to user ${username}`)
    return send(204)

  } else if (refreshToken) {
    log.info?.(`authorize: refreshing token for user ${getCookie(Cookie.Username)}`)
    const { access_token, expires_in } = await oauth.refreshToken(ctx, refreshToken)

    log.debug?.(`authorize: token refreshed, got access token: ${access_token}`)
    return send(204, undefined, {
      'Set-Cookie': [
        formatCookie(Cookie.AccessToken, access_token, expires_in - 60, conf),
      ],
    })

  } else if (conf.accessAllowAnonymous) {
    log.debug?.('authorize: access granted to unauthenticated user')
    return send(204)

  } else {
    log.info?.('authorize: no token provided, redirecting to authorization endpoint')
    return send(401, undefined, {
      'WWW-Authenticate': 'Bearer error="unauthorized"',
    })
  }
}

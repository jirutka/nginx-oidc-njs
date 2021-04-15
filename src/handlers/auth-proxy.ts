import type { RequestHandler } from '..'
import { Cookie } from '../constants'
import * as oauth from '../oauth'
import { formatCookie } from '../utils'


export const auth_proxy: RequestHandler = async (ctx) => {
  const { conf, getCookie, log, send } = ctx
  ctx.handlerType = 'auth_request'

  const accessToken = oauth.getRequestAccessToken(ctx)
  const refreshToken = getCookie(Cookie.RefreshToken)

  if (accessToken) {
    log.debug?.(`proxy: found access token: ${accessToken}`)

    return send(204, undefined, {
      'Authorization': `Bearer ${accessToken}`,
    })

  } else if (refreshToken) {
    log.info?.(`proxy: refreshing token for user ${getCookie(Cookie.Username)}`)
    const { access_token, expires_in } = await oauth.refreshToken(ctx, refreshToken)

    log.debug?.(`proxy: token refreshed, got access_token: ${access_token}`)
    return send(204, undefined, {
      'Authorization': `Bearer ${access_token}`,
      'Set-Cookie': [
        formatCookie(Cookie.AccessToken, access_token, expires_in - 60, conf),
      ],
    })

  } else {
    log.debug?.('proxy: no token found, returning 401')
    return send(401, undefined, {
      'WWW-Authenticate': 'Bearer error="unauthorized"',
    })
  }
}

import type { RequestHandler } from '..'
import { Cookie, Session } from '../constants'
import { getRequestAccessToken, refreshTokens } from '../oauth'


export const auth_proxy: RequestHandler = async (ctx) => {
  const { getCookie, log, send, vars } = ctx
  ctx.handlerType = 'auth_request'

  const accessToken = getRequestAccessToken(ctx)
  const refreshToken = vars[Session.RefreshToken]

  if (accessToken) {
    log.debug?.(`proxy: found access token: ${accessToken}`)

    return send(204, undefined, {
      'Authorization': `Bearer ${accessToken}`,
    })

  } else if (refreshToken) {
    log.info?.(`proxy: refreshing token for user ${getCookie(Cookie.Username)}`)
    const { access_token } = await refreshTokens(ctx, refreshToken)

    return send(204, undefined, {
      'Authorization': `Bearer ${access_token}`,
    })

  } else {
    log.debug?.('proxy: no token found, returning 401')
    return send(401, undefined, {
      'WWW-Authenticate': 'Bearer error="unauthorized"',
    })
  }
}

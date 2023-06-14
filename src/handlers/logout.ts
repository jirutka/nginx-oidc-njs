import qs from 'querystring'

import type { RequestHandler } from '../'
import { Cookie, Session } from '../constants'
import { formatCookieClear } from '../cookie'


export const logout: RequestHandler = ({ conf, getCookie, log, req, send, vars }) => {
  if (req.method !== 'POST') {
    return send(405, undefined, { Allow: 'POST always' })
  }
  const nextUri = req.args.nextUri
    ? qs.unescape(req.args.nextUri)
    : conf.postLogoutRedirectUri

  log.info?.(`logout: logging out user ${getCookie(Cookie.Username)}`)

  vars[Session.AccessToken] = undefined
  vars[Session.IdToken] = undefined
  vars[Session.RefreshToken] = undefined

  return send(303, nextUri, {
    'Set-Cookie': [
      formatCookieClear(Cookie.SessionId, conf.cookieAttrs),
      formatCookieClear(Cookie.Username, conf.cookieAttrs),
    ],
  })
}

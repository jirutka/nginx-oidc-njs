import qs, { ParsedUrlQueryInput } from 'querystring'

import type { RequestHandler } from '../'
import { Cookie, Session } from '../constants'
import { formatCookieClear } from '../cookie'
import { absoluteUrl, preferredMediaType, url } from '../utils'


const supportedMediaType = ['-', 'text/html'] as const

const logoutPage = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Logged out</title>
  <style>
    html {
      height: 100%;
    }
    body {
      position: relative;
      top: 33%;
      transform: translateY(-33%);
      text-align: center;
      max-width: 40rem;
      margin: auto;
      font-family: mono;
    }
  </style>
</head>
<body>
  <h1>Logged out</h1>
  <p>You have been logged out, please close this page.</p>
</body>
</html>
`

export const logout: RequestHandler = ({ conf, getCookie, log, req, send, vars }) => {
  if (req.method !== 'POST') {
    return send(405, undefined, { Allow: 'POST always' })
  }

  log.info?.(`logout: logging out user ${getCookie(Cookie.Username)}`)

  let nextUri = req.args.nextUri
    ? qs.unescape(req.args.nextUri)
    : conf.postLogoutRedirectUri

  // OpenID Connect RP-Initiated Logout 1.0
  if (conf.endSessionEndpoint) {
    const args: ParsedUrlQueryInput = {
      id_token_hint: vars[Session.IdToken],
      client_id: conf.clientId,
    }
    if (nextUri) {
      args.post_logout_redirect_uri = absoluteUrl(nextUri, vars)
    }
    nextUri = url(conf.endSessionEndpoint, args)
  }

  vars[Session.AccessToken] = undefined
  vars[Session.IdToken] = undefined
  vars[Session.RefreshToken] = undefined

  const headers: NginxHeadersOut = {
    'Set-Cookie': [
      formatCookieClear(Cookie.SessionId, conf.cookieAttrs),
      formatCookieClear(Cookie.Username, conf.cookieAttrs),
    ],
  }

  if (nextUri) {
    return send(303, nextUri, headers)
  }
  const mediaType = preferredMediaType(req.headersIn['Accept'] || '', supportedMediaType)
  if (mediaType === 'text/html') {
    return send(200, logoutPage, {
      ...headers,
      'Content-Type': 'text/html',
    })
  }
  return send(204, undefined, headers)
}

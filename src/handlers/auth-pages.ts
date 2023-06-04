import type { Context, RequestHandler } from '..'
import { Cookie, Session, VAR_SITE_ROOT_URI } from '../constants'
import * as oauth from '../oauth'
import { fetchUser } from '../user-api'
import { assert } from '../utils'
import {
  findSiteRootUri,
  isAnonymousAllowed,
  isUserAllowed,
  readSiteConfig,
  resolveAccessRule,
  splitUriToBranchAndPagePath,
  AccessRule,
} from '../pages'


export const auth_pages: RequestHandler = async (ctx) => {
  const { conf, getCookie, fail, log, send, vars } = ctx
  ctx.handlerType = 'auth_request'

  const requestUri = assert(vars.request_uri, 'request_uri must be defined')

  // `realpath_root` is undefined if `root` directory doesn't exist
  const documentRoot = vars.realpath_root
  if (!documentRoot) {
    return fail(404, 'Site Not Found')
  }

  // Variable VAR_SITE_ROOT_URI is set by the pages-document-uri handler, when used.
  const siteRootUri = vars[VAR_SITE_ROOT_URI]
    || findSiteRootUri(requestUri, documentRoot, conf.pagesMinDepth, conf.pagesMaxDepth)
  if (!siteRootUri) {
    return fail(404, 'Site Not Found')
  }
  log.debug?.(`authorize: resolved site root uri: ${siteRootUri}`)

  const [branch = conf.pagesDefaultBranch, pagePath] = splitUriToBranchAndPagePath(requestUri, siteRootUri)

  const config = readSiteConfig(documentRoot + siteRootUri)
  const accessRule = resolveAccessRule(config, branch, pagePath, conf.pagesFallbackPolicy)

  const accessToken = oauth.getRequestAccessToken(ctx)
  const refreshToken = vars[Session.RefreshToken]

  if (accessToken) {
    log.debug?.(`authorize: verifying access token: ${accessToken}`)
    return await authorizeTokenAndAccess(ctx, accessToken, accessRule)

  } else if (refreshToken) {
    log.info?.(`authorize: refreshing token for user ${getCookie(Cookie.Username)}`)
    const { access_token } = await oauth.refreshToken(ctx, refreshToken)

    log.debug?.(`authorize: token refreshed, got access token: ${access_token}`)
    vars[Session.AccessToken] = access_token

    return await authorizeTokenAndAccess(ctx, access_token, accessRule)

  } else if (isAnonymousAllowed(accessRule)) {
    log.info?.('authorize: allowing anonymous access')
    return send(204)

  } else {
    log.info?.('authorize: no token provided and authentication required, redirecting to authorization endpoint')
    return send(401, undefined, {
      'WWW-Authenticate': 'Bearer error="unauthorized"',
    })
  }
}

async function authorizeTokenAndAccess (
  ctx: Context,
  accessToken: string,
  accessRule: AccessRule,
): Promise<void> {
  const { fail, log, send, vars } = ctx

  const { username } = await oauth.verifyToken(ctx, accessToken).catch(err => {
    if (err.status === 401) {
      vars[Session.AccessToken] = undefined
    }
    throw err
  })

  log.debug?.(`authorize: access token verified, fetching user ${username}`)
  const user = await fetchUser(ctx, username, accessToken)

  if (isUserAllowed(accessRule, user)) {
    log.info?.(`authorize: access granted to user ${user.username}`)
    return send(204)

  } else {
    return fail(403, 'Access Denied', 'You are not allowed to access this page.')
  }
}

import type { RequestHandler } from '..'
import { authorizeAccess, isAnonymousAllowed } from '../access'
import { Cookie, Session, VAR_SITE_ROOT_URI } from '../constants'
import { refreshTokens } from '../oauth'
import { assert } from '../utils'
import {
  findSiteRootUri,
  readSiteConfig,
  resolveAccessRule,
  splitUriToBranchAndPagePath,
} from '../pages'
import { decodeAndValidateIdToken } from '../jwt'


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

  const idTokenJwt = vars[Session.IdToken]
  if (idTokenJwt) {
    log.debug?.(`authorize: validating id token: ${idTokenJwt}`)

    const idToken = await decodeAndValidateIdToken(conf, idTokenJwt).catch(err => {
      log.warn?.(`authorize: invalid or malformed ID token: ${err.detail ?? err.message}`)
      vars[Session.IdToken] = undefined
    })
    if (idToken) {
      return await authorizeAccess(ctx, idToken, accessRule)
    }
  }

  const refreshToken = vars[Session.RefreshToken]
  if (refreshToken) {
    log.info?.(`authorize: refreshing token for user ${getCookie(Cookie.Username)}`)

    const tokenSet = await refreshTokens(ctx, refreshToken).catch(err => {
      if (err.status === 401) {
        // The refresh token probably just expired, so let's act like the user
        // is unauthenticated.
        log.info?.(`authorize: invalid refresh token: ${err.detail ?? err.message}`)
      } else {
        throw err
      }
    })
    if (tokenSet) {
      return await authorizeAccess(ctx, tokenSet.idToken, accessRule)
    }
  }

  if (isAnonymousAllowed(accessRule)) {
    log.info?.('authorize: allowing anonymous access')
    return send(204)

  } else {
    log.info?.('authorize: no token provided and authentication required, redirecting to authorization endpoint')
    return send(401, undefined, {
      'WWW-Authenticate': 'Bearer error="unauthorized"',
    })
  }
}

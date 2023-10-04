import type { Context, RequestHandler } from '..'
import { authorizeAccess, isAnonymousAllowed } from '../access'
import { Cookie, Session } from '../constants'
import { IdToken, decodeAndValidateIdToken } from '../jwt'
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
      exposeClaims(ctx, idToken)
      return authorizeAccess(ctx, idToken, conf)
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
      exposeClaims(ctx, tokenSet.idToken)
      return authorizeAccess(ctx, tokenSet.idToken, conf)
    }
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

function exposeClaims ({ vars }: Context, idToken: IdToken): void {
  // The following variables must be initialised using `js_var` to be set. If
  // the variable is not initialised at all, the if condition is false.
  if ('oidc_jwt_claims' in vars) {
    vars.oidc_jwt_claims = JSON.stringify(idToken)
  }
  if ('oidc_jwt_claim_roles' in vars) {
    vars.oidc_jwt_claim_roles = idToken.roles.join(' ')
  }
  if ('oidc_jwt_claim_username' in vars) {
    vars.oidc_jwt_claim_username = idToken.username
  }
}

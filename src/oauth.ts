import qs from 'querystring'

import type { Context } from './'
import { Cookie } from './constants'
import * as uuidCrypto from './uuid-crypto'
import { formatCookie, parseJsonBody, reject } from './utils'


/**
 * A token info returned by OAAS' check_token endpoint.
 *
 * This type is non-standard introduced by early versions of Spring Security OAuth 2.0;
 * it predates RFC 7662 (Token Introspection).
 */
export interface TokenInfo {
  /** Client identifier for the OAuth 2.0 client that requested this token. */
  client_id: string
  /** Number of seconds since January 1 1970 UTC, indicating when this token will expire. */
  exp: number
  /** A space-separated list of scopes associated with this token. */
  scope: string[]
  /* Human-readable identifier for the resource owner who authorized this token. */
  user_name?: string
}

/**
 * Successful token response as defined in RFC 6749.
 */
export interface TokenResponse {
  token_type: 'bearer'
  /** The access token issued by the authorization server. */
  access_token: string
  /** The refresh token. */
  refresh_token?: string
  /** The lifetime in seconds of the access token. */
  expires_in: number
  /** A space-separated list of scopes associated with this token. */
  scope?: string
}

export interface ErrorResponse {
  error: string
  error_description?: string
}

type GrantType = 'authorization_code' | 'refresh_token'

/**
 * Requests a new access token using the specified grant.
 */
export async function requestToken (ctx: Context, grantType: GrantType, value: string): Promise<TokenResponse> {
  const { conf, subrequest } = ctx

  const paramName = {
    authorization_code: 'code',
    refresh_token: 'refresh_token',
  }[grantType]

  const params = {
    grant_type: grantType,
    redirect_uri: conf.redirectUri,
    [paramName]: value,
  }

  // NOTE: Parameters for token endpoint should be in body, but we need them
  // even in URI for caching (cache key is derived from them).
  const { status, responseText } = await subrequest('POST', `${conf.internalLocationsPrefix}/request-token`,
    params,
    qs.stringify({ ...params, redirect_uri: conf.redirectUri }),
  )
  switch (status) {
    case 400:
    case 401: {
      const data = parseJsonBody(responseText) as ErrorResponse

      if (data.error === 'invalid_grant') {
        return grantType === 'refresh_token'
          ? reject(401, 'Invalid Refresh Token', data.error_description, {
              'Set-Cookie': [formatCookie(Cookie.RefreshToken, '', 0, conf)],
            })
          : reject(401, 'Invalid Authorization Code', data.error_description)
      } else {
        return reject(500, 'OAuth Configuration Error',
          `OAuth server returned error: ${data.error_description} (${data.error}).`
          + ' This is most likely caused by the OAuth proxy misconfiguration.')
      }
    }
    // @ts-ignore falls through
    case 200: {
      const data = parseJsonBody(responseText)
      if ('access_token' in data) {
        return data as TokenResponse
      }
    }
    default: {
      return reject(502, 'OAuth Server Error',
        `Unable to issue an access token, OAuth server returned HTTP ${status}.`)
    }
  }
}

/**
 * Requests a new access token using the given encrypted refresh token.
 */
export async function refreshToken (ctx: Context, encryptedRefreshToken: string): Promise<TokenResponse> {
  const { conf } = ctx

  const refreshToken = uuidCrypto.decrypt(encryptedRefreshToken, conf.cookieCipherKey)

  if (refreshToken) {
    return await requestToken(ctx, 'refresh_token', refreshToken)
  } else {
    return reject(403, 'Invalid Refresh Token', 'Unable to decrypt Refresh Token provided in cookie.', {
      'Set-Cookie': [formatCookie(Cookie.RefreshToken, '', 0, conf)],
    })
  }
}

/**
 * Verifies the given access token using the authorization server's token
 * introspection endpoint.
 *
 * @param ctx
 * @param accessToken
 */
export async function verifyToken (ctx: Context, accessToken: string): Promise<Required<TokenInfo>> {
  const { conf, vars } = ctx

  const token = await fetchTokenInfo(ctx, accessToken)

  if (token.client_id !== conf.clientId) {
    return reject(403, 'Invalid Access Token',
      `Token ${accessToken} was issued to another client service.`)
  }
  if (token.exp < parseInt(vars.msec!)) {
    return reject(401, 'Invalid Access Token', `Token ${accessToken} has expired at ${token.exp}.`, {
      'Set-Cookie': [formatCookie(Cookie.AccessToken, '', 0, conf)],
    })
  }
  if (!token.user_name) {
    // This normally cannot happen.
    return reject(500, 'Invalid Access Token',
      `Token ${accessToken} was not issued using the authorization_code grant.`)
  }
  return token as Required<typeof token>
}

async function fetchTokenInfo (ctx: Context, token: string): Promise<TokenInfo> {
  const { conf, subrequest } = ctx

  const { status, responseText } = await subrequest('POST',
    `${conf.internalLocationsPrefix}/check-token`, { token },
  )
  switch (status) {
    case 400: {
      const data = parseJsonBody(responseText) as ErrorResponse
      return data.error === 'invalid_token'
        ? reject(401, 'Invalid Access Token', `${data.error_description}: ${token}`, {
            'Set-Cookie': [formatCookie(Cookie.AccessToken, '', 0, conf)],
          })
        : reject(502, 'OAuth Server Error', data.error_description)
    }
    // @ts-ignore falls through
    case 200: {
      const data = parseJsonBody(responseText)
      if ('client_id' in data) {
        return data as TokenInfo
      }
    }
    default: {
      return reject(502, 'OAuth Server Error',
        `Unable to verify access token ${token}, server has returned HTTP ${status}.`)
    }
  }
}

/**
 * Looks for a Bearer access token in the request in:
 *
 * 1. `Authorization` header
 * 2. query parameter `access_token`
 * 3. cookie {@link Cookie.AccessToken}.
 *
 * If the token is not found, returns `undefined`.
 */
export function getRequestAccessToken (ctx: Context): string | undefined {
  const { getCookie, req } = ctx

  const header = req.headersIn.Authorization
  if (header?.startsWith('Bearer ')) {
    return header.split(' ')[1]
  }

  const query = req.args.access_token
  if (query) {
    return query
  }

  const cookie = getCookie(Cookie.AccessToken)
  if (cookie) {
    return cookie
  }

  return
}

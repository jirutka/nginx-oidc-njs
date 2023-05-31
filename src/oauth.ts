import qs from 'querystring'

import type { Context } from './'
import { Cookie, Session } from './constants'
import { reject } from './error'
import { formatCookie, parseJsonBody, timestamp } from './utils'


/**
 * Successful token response as defined in RFC 6749.
 */
export interface TokenResponse {
  token_type: 'bearer'
  /** The access token issued by the authorization server. */
  access_token: string
  /** The refresh token. */
  refresh_token?: string
  /** The ID Token; this is present if the `openid` scope was requested. */
  id_token?: string
  /** The lifetime in seconds of the access token. */
  expires_in: number
  /** A space-separated list of scopes associated with this token. */
  scope?: string
}

export interface ErrorResponse {
  error: string
  error_description?: string
}

/**
 * Token introspection response as specified in [RFC 7662](https://datatracker.ietf.org/doc/html/rfc7662#section-2.2).
 * Some properties are omitted. The RFC specifies all properties except `active`
 * as optional, but we validate and require them.
 */
export interface IntrospectionResponse {
  /** An indicator of whether or not the presented token is currently active. */
  active: boolean
  /** A space-separated list of scopes associated with this token. */
  scope: string
  /** Client identifier for the OAuth 2.0 client that requested this token. */
  client_id: string
  /** Human-readable identifier for the resource owner who authorized this token. */
  username: string
  /** Number of seconds since 1970-01-01 UTC, indicating when this token will expire. */
  exp: number
}

type GrantType = 'authorization_code' | 'refresh_token'

/**
 * Requests new tokens using the specified grant.
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
        const title = grantType === 'refresh_token'
          ? 'Invalid Refresh Token'
          : 'Invalid Authorization Code'
        return reject(401, title, data.error_description)
      } else {
        return reject(500, 'OAuth Configuration Error',
          `OAuth server returned error: ${data.error_description} (${data.error}).`
          + ' This is most likely caused by the OAuth proxy misconfiguration.')
      }
    }
    case 200: {
      const data = parseJsonBody(responseText)
      if (isTokenResponse(data)) {
        return data
      } else {
        return reject(500, 'OAuth Server Error',
          `OAuth server returned an invalid token response: ${responseText?.slice(0, 128)}...`)
      }
    }
    default: {
      return reject(502, 'OAuth Server Error',
        `Unable to issue an access token, OAuth server returned HTTP ${status}.`)
    }
  }
}

function isTokenResponse(obj: unknown): obj is TokenResponse {
  const o = obj as TokenResponse

  return typeof o.token_type === 'string'
    && o.token_type.toLowerCase() === 'bearer'
    && typeof o.access_token === 'string'
    && typeof o.expires_in === 'number'
    && (!o.refresh_token || typeof o.refresh_token === 'string')
}

/**
 * Requests a new access token using the given refresh token. If the refresh
 * token is invalid (OAAS returns `invalid_grant` error), it will remove it from
 * the session.
 */
export async function refreshToken (ctx: Context, refreshToken: string): Promise<TokenResponse> {
  try {
    return await requestToken(ctx, 'refresh_token', refreshToken)
  } catch (err: any) {
    if (err.status === 401) {
      ctx.vars[Session.RefreshToken] = undefined
    }
    throw err
  }
}

/**
 * Verifies the given access token using the authorization server's token
 * introspection endpoint.
 */
export async function verifyToken (
  ctx: Context,
  accessToken: string
): Promise<IntrospectionResponse> {
  const { conf } = ctx

  const token = await introspectToken(ctx, accessToken)

  if (!token.active) {
    return reject(401, 'Invalid Access Token',
      'Provided token is not active, does not exist or we are not allowed to introspect it.'
      + ` Given token: ${accessToken}.`,
      { 'Set-Cookie': [formatCookie(Cookie.AccessToken, '', 0, conf)] })
  }

  for (const key of ['client_id', 'exp'] as const) {
    if (!token[key]) {
      return reject(500, 'OAuth Server Error',
        `Introspection endpoint responded with an object without the ${key} parameter.`
        + ` Given token: ${accessToken}.`)
    }
  }
  if (token.client_id !== conf.clientId) {
    return reject(403, 'Invalid Access Token',
      "Token's client_id does not match, it was probably issued to another client."
      + ` Given token: ${accessToken}`)
  }
  if (!token.username) {
    return reject(403, 'Invalid Access Token',
      `Token does not have a username attached. Given token: ${accessToken}`)
  }
  if (typeof token.exp !== 'number' || token.exp < timestamp()) {
    return reject(401, 'Invalid Access Token',
      `Token has expired at ${token.exp}. Given token: ${accessToken}.`,
      { 'Set-Cookie': [formatCookie(Cookie.AccessToken, '', 0, conf)] })
  }
  token.scope ??= ''

  return token as Required<typeof token>
}

async function introspectToken (ctx: Context, token: string): Promise<Partial<IntrospectionResponse>> {
  const { conf, subrequest } = ctx

  // Note: Query parameter is only for the subrequest caching, it's not passed
  // to the OAuth server.
  const { status, responseText } = await subrequest('POST',
    `${conf.internalLocationsPrefix}/introspect-token`, { token }, qs.stringify({ token }),
  )
  switch (status) {
    case 401: {
      const data = parseJsonBody(responseText) as ErrorResponse
      return reject(500, 'OAuth Configuration Error',
        `Introspection endpoint responded with Unauthorized error: ${data.error_description}`
        + ` (${data.error}). This is most likely caused by the OAuth proxy misconfiguration.`)
    }
    // @ts-ignore falls through
    case 200: {
      const data = parseJsonBody(responseText)
      if ('active' in data) {
        return data as IntrospectionResponse
      }
    }
    default: {
      return reject(502, 'OAuth Server Error',
        `Unable to verify access token, server has returned HTTP ${status}. Given token: ${token}.`)
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

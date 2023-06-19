import qs from 'querystring'

import type { Context } from './'
import { Session } from './constants'
import { HttpError, reject } from './error'
import { decodeAndValidateIdToken, IdToken, validateJwtSign } from './jwt'
import { parseJsonBody, timestamp } from './utils'


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
  id_token: string
  /** The lifetime in seconds of the access token. */
  expires_in: number
  /** A space-separated list of scopes associated with this token. */
  scope?: string
}

/**
 * {@link TokenResponse} with added the decoded id_token payload.
 */
export interface DecodedTokenResponse extends TokenResponse {
  /** The decoded ID Token payload. */
  idToken: IdToken,
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

/**
 * Authorization state stored in session store between OAuth 2.0 authorization
 * request and response.
 */
export interface AuthState {
  /** Number of seconds since 1970-01-01 UTC, indicating when this state will expire. */
  exp: number
  /** A value used to associate a client session with an ID Token. */
  nonce: string
  /** An (original) URL where to redirect the user agent after successful authorization. */
  url: string
}

export namespace AuthState {
  /**
   * Serializes the given AuthState object so it can be stored in session.
   */
  export function encode (obj: AuthState): string {
    return JSON.stringify(obj)
  }

  /**
   * Decodes the given AuthState string and validates its expiration time.
   *
   * @throws {HttpError} if the given string is not a valid JSON or it's expired.
   */
  export function decode (json: string): AuthState {
    let obj: AuthState
    try {
      obj = JSON.parse(json)
    } catch (err: any) {
      throw HttpError(400, 'Invalid State',
        `Failed to deserialize the stored authorization state: ${err.message}`)
    }
    // The in-memory keyval_zone doesn't support TTL. It shouldn't be used in
    // production, but still better to not rely on it.
    if (typeof obj.exp !== 'number' || obj.exp < timestamp()) {
      throw HttpError(400, 'Invalid State', 'The authorization state has expired.')
    }
    return obj
  }
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
  const { status, responseBuffer } = await subrequest('POST', `${conf.internalLocationsPrefix}/request-token`,
    params,
    qs.stringify({ ...params, redirect_uri: conf.redirectUri }),
  )
  switch (status) {
    case 400:
    case 401: {
      const data = parseJsonBody(responseBuffer) as ErrorResponse

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
      const data = parseJsonBody(responseBuffer)
      if (!isTokenResponse(data)) {
        return reject(500, 'OAuth Server Error',
          `OAuth server returned an invalid token response: ${responseBuffer?.slice(0, 128)}...`)
      } else if (!data.id_token) {
        return reject(500, 'OAuth Configuration Error',
          'OAuth server returned token response without id_token.')
      } else {
        return data
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
 * Requests new tokens using the given `refreshToken`, decodes and validates the
 * ID token. If valid, it stores the new ID token, access token and refresh
 * token (if included in the response) in the session variables and returns the
 * Token Response with extra field `idToken` - the decoded ID token payload.
 *
 * If the given `refreshToken` or the new ID token is invalid (OAuth 2.0 server
 * returned HTTP 401), it will clear the refresh token session variable.
 */
export async function refreshTokens (ctx: Context, refreshToken: string): Promise<DecodedTokenResponse> {
  const { conf, log, vars } = ctx
  try {
    const tokenSet = await requestToken(ctx, 'refresh_token', refreshToken) as DecodedTokenResponse
    const { access_token, id_token, refresh_token } = tokenSet

    log.debug?.(`oauth: token refreshed, got id_token=${id_token}, access_token=${access_token},`
              + ` refresh_token=${refresh_token}`)

    await validateJwtSign(ctx, id_token)
    tokenSet.idToken = await decodeAndValidateIdToken(conf, id_token)

    vars[Session.AccessToken] = access_token
    vars[Session.IdToken] = id_token
    if (refresh_token) {
      vars[Session.RefreshToken] = refresh_token
    }

    return tokenSet

  } catch (err: any) {
    if (err.status === 401) {
      vars[Session.RefreshToken] = undefined
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
      + ` Given token: ${accessToken}.`)
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
      `Token has expired at ${token.exp}. Given token: ${accessToken}.`)
  }
  token.scope ??= ''

  return token as Required<typeof token>
}

async function introspectToken (ctx: Context, token: string): Promise<Partial<IntrospectionResponse>> {
  const { conf, subrequest } = ctx

  // Note: Query parameter is only for the subrequest caching, it's not passed
  // to the OAuth server.
  const { status, responseBuffer } = await subrequest('POST',
    `${conf.internalLocationsPrefix}/introspect-token`, { token }, qs.stringify({ token }),
  )
  switch (status) {
    case 401: {
      const data = parseJsonBody(responseBuffer) as ErrorResponse
      return reject(500, 'OAuth Configuration Error',
        `Introspection endpoint responded with Unauthorized error: ${data.error_description}`
        + ` (${data.error}). This is most likely caused by the OAuth proxy misconfiguration.`)
    }
    // @ts-ignore falls through
    case 200: {
      const data = parseJsonBody(responseBuffer)
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
 * 3. session variable {@link Session.AccessToken}.
 *
 * If the token is not found, returns `undefined`.
 */
export function getRequestAccessToken (ctx: Context): string | undefined {
  const { req, vars } = ctx

  const header = req.headersIn.Authorization
  if (header?.startsWith('Bearer ')) {
    return header.split(' ')[1]
  }

  const query = req.args.access_token
  if (query) {
    return query
  }

  const session = vars[Session.AccessToken]
  if (session) {
    return session
  }

  return
}

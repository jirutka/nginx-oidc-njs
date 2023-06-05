import { Context } from './'
import { HttpError, reject } from './error'
import { arrify, isPositiveInteger, timestamp } from './utils'


/**
 * JWT Claims Set represents a JSON object whose members are the claims conveyed
 * by the JWT ([RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519#section-4)).
 * TODO + RFC 9068, OpenID Connect 1.0 Core
 */
interface JwtClaimsSet {
  /** Issuer – the principal that issued the JWT (e.g. OpenID Provider). */
  iss: string
  /** Subject – the principal that is the subject of the JWT (e.g. authenticated user or client). */
  sub: string
  /** Audience(s) – the recipients that the JWT is intended for (typically a client id). */
  aud: string | string[]
  /** Expiration Time – the time (unix timestamp) on or after which the JWT is invalid. */
  exp: number
  /** Issued At – the time (unix timestamp) at which the JWT was issued. */
  iat: number
  /** Not Before – the time before which the JWT is invalid. */
  nbf?: number
  /** JWT ID – provides a unique identifier for the JWT. */
  jti?: string

  [key: string]: unknown
}

export interface IdToken extends JwtClaimsSet {
  /** A value used to associate the Client session with the ID Token, and to mitigate replay attacks. */
  nonce?: string
  /**
   * The roles of the authenticated user. This is set to the claim specified by
   * the `claimRoles` config option.
   */
  roles: readonly string[]
  /**
   * The username for the authenticated user. This is set to the claim specified
   * by the `claimUsername` config option.
   */
  username: string
}

/**
 * Claims required for ID Tokens per [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html#IDToken).
 * The same claims are also required for JWT Access Tokens per [RFC 9068](https://datatracker.ietf.org/doc/html/rfc9068#name-data-structure).
 */
const REQUIRED_CLAIMS = ['iss', 'sub', 'aud', 'exp', 'iat'] as const

/**
 * Validates the signature and claims of the given `jwt` token (in Compact JWS
 * format) and returns the claims.
 *
 * @throws {HttpError} if `jwt` is invalid.
 */
export async function validateJwtSign (ctx: Context, jwt: string): Promise<void> {
  const { conf, subrequest } = ctx

  const { status } = await subrequest('POST', `${conf.internalLocationsPrefix}/validate-jwt`, { token: jwt })
  if (status === 401) {
    return reject(401, 'Invalid JWT token', "The token's signature or structure is invalid.")

  } else if (status !== 204) {
    return reject(500, 'OAuth Configuration Error', 'Unable to validate JWT token.')
  }
}

/**
 * Decodes the ID token from the given `jwt` token (in Compact JWS format),
 * validates the claims and returns them. This function does **not** validate
 * the token signature.
 *
 * @throws {HttpError} if `jwt` is malformed, invalid or expired.
 * @throws {SyntaxError} if `jwt`'s payload is not a valid JSON.
 */
export async function decodeAndValidateIdToken (conf: Context['conf'], jwt: string): Promise<IdToken> {
  // Note: This function doesn't have to be async, but since all others are,
  // it's more convenient to use the same error handling style.

  const claims = decodeAndValidateJwtClaims(conf, jwt) as IdToken

  const username = claims[conf.claimUsername]
  if (!username || typeof username !== 'string') {
    return reject(500, 'Invalid ID token',
      `The ID token is missing claim '${conf.claimUsername}' or it's not a string.`)
  }
  claims.username = username

  if (conf.claimRoles) {
    const roles = claims[conf.claimRoles]

    if (!roles || !Array.isArray(roles)) {
      return reject(500, 'Invalid ID token',
        `The ID token is missing claim '${conf.claimRoles}' or it's not an array.`)
    }
    claims.roles = roles
  } else {
    claims.roles = []
  }

  return claims
}

function decodeAndValidateJwtClaims (conf: Context['conf'], jwt: string): JwtClaimsSet {
  const claims = decodeJwtPayload(jwt)

  if (REQUIRED_CLAIMS.some(claim => !claims[claim])) {
    throw HttpError(500, 'Malformed JWT token',
      `The token is missing required claims: ${REQUIRED_CLAIMS.filter(claim => !claims[claim]).join(', ')}.`)
  }

  if (!isPositiveInteger(claims.iat)) {
    throw HttpError(500, 'Malformed JWT token',
      `The token's iat claim is not a valid number: ${claims.iat}.`)
  }

  if (claims.iss !== conf.issuer) {
    throw HttpError(401, 'Invalid JWT token',
      `The token's issuer '${claims.iss}' does not match the configured issuer '${conf.issuer}'.`)
  }

  const aud = arrify(claims.aud)
  if (!aud.includes(conf.clientId)) {
    throw HttpError(401, 'Invalid JWT token',
      `The token's audience (${aud.join(', ')}) does not include the configured client_id.`)
  }

  if (!isPositiveInteger(claims.exp) || claims.exp <= timestamp()) {
    throw HttpError(401, 'Expired JWT token', `The token expired at ${claims.exp}.`)
  }

  return claims
}

/**
 * Decodes and returns payload from the given `jwt` token (in Compact JWS
 * format) without any validation.
 *
 * @throws {HttpError} if `jwt` doesn't have three dot-separated parts.
 * @throws {SyntaxError} if `jwt`'s payload is not a valid JSON.
 */
function decodeJwtPayload (jwt: string): JwtClaimsSet {
  const parts = jwt.split('.')
  if (parts.length !== 3) {
    throw HttpError(500, 'Malformed JWT token', 'The token is not in the Compact JWS format.')
  }

  return JSON.parse(Buffer.from(parts[1], 'base64url').toString())
}

import { Context } from '.'
import { IdToken } from './jwt'
import { toLookupTable } from './utils'


export interface AccessRule {
  /**
   * A set of basic roles (see {@link BasicRole}), business roles and/or usernames.
   * If the user has any of the specified roles or username and has none of the roles
   * or username specified in `deny`, access will be allowed. Otherwise, access will
   * be denied.
   */
  allow: readonly string[]
  /**
   * A set of basic roles (see {@link BasicRole}), business roles and/or usernames.
   * If the user has any of these roles or username, access will be denied.
   */
  deny: readonly string[]
}

export interface Principal {
  readonly username: string
  readonly roles: ReadonlyArray<string>
}

export const enum BasicRole {
  /** No authentication is required. */
  ANONYMOUS = 'ANONYMOUS',

  /** Authentication is required. */
  AUTHENTICATED = 'AUTHENTICATED',
}

/**
 * The default allow rule that permits any authenticated user. This is for
 * performance optimisation.
 */
export const ALLOW_AUTHENTICATED: readonly string[] = [BasicRole.AUTHENTICATED]

/**
 * Authorizes access for the principal (user) identified by the given `idToken`
 * based on the `allow` and `deny` list in the given `accessRule` object.
 *
 * If the user has any of the roles or username specified in `allow` list and
 * has none of the roles or username specified in `deny` list, the function
 * sends HTTP 204 and the access is be allowed. Otherwise, sends HTTP 403 and
 * the access is denied.
 */
export async function authorizeAccess (ctx: Context, idToken: IdToken, accessRule: AccessRule): Promise<void> {
  const { fail, log, send } = ctx

  if (isAllowed(idToken, accessRule)) {
    log.info?.(`authorize: access granted to user ${idToken.username}`)
    return send(204)

  } else {
    log.info?.(`authorize: access denied to user ${idToken.username}`)
    return fail(403, 'Access Denied', 'You are not allowed to access this page.')
  }
}

function isAllowed ({ username, roles }: Principal, access: AccessRule): boolean {
  if (access.deny.length > 0) {
    const deny = toLookupTable(access.deny)
    if (username in deny || roles.some(role => role in deny)) {
      return false
    }
  }
  if (access.allow === ALLOW_AUTHENTICATED) {
    return true
  }
  if (access.allow.length > 0) {
    const allow = toLookupTable(access.allow)
    if (BasicRole.ANONYMOUS in allow || BasicRole.AUTHENTICATED in allow) {
      return true
    }
    if (username in allow || roles.some(role => role in allow)) {
      return true
    }
  }
  return false
}

/**
 * Returns `true` if the given allow/deny `accessRule` allows access to
 * {@link BasicRole.ANONYMOUS}, otherwise `false`.
 */
export function isAnonymousAllowed (accessRule: AccessRule): boolean {
  return !!accessRule.allow.includes(BasicRole.ANONYMOUS)
    && !accessRule.deny.includes(BasicRole.ANONYMOUS)
}

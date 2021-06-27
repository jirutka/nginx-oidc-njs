import { globMatch, pathExists, readJSON, toLookupTable } from './utils'


export interface SiteConfig {
  /**
   * The domain name on which the site should be available.
   */
  domain?: string,
  /**
   * Access rules.
   */
  access?: AccessRules
}

type AccessRules = {
  [branchPattern: string]: {
    [uriPattern: string]: AccessRule,
  },
}

export interface AccessRule {
  /**
   * A set of basic roles (see {@link BasicRole}), business roles and/or usernames.
   * If the user has any of the specified roles or username and has none of the roles
   * or username specified in `deny`, access will be allowed. Otherwise, access will
   * be denied.
   */
  allow?: string[]
  /**
   * A set of basic roles (see {@link BasicRole}), business roles and/or usernames.
   * If the user has any of these roles or username, access will be denied.
   */
  deny?: string[]
}

export const enum BasicRole {
  /** No authentication is required. */
  ANONYMOUS = 'ANONYMOUS',

  /** Authentication is required. */
  AUTHENTICATED = 'AUTHENTICATED',
}

interface User {
  readonly username: string
  readonly roles: ReadonlyArray<string>
}

const SITE_CONFIG_NAME = '.site.json'


/**
 * Reads `.site.json` in the specified site root directory.
 *
 * @param siteRootDir An absolute path of the directory with `.site.json` and branches.
 */
export function readSiteConfig (siteRootDir: string): SiteConfig {
  return readJSON(`${siteRootDir}/${SITE_CONFIG_NAME}`) as SiteConfig
}

/**
 * Returns URI prefix of the _site_ root based on the request URI, or `null` if not found.
 * The site root is determined by the existence of the `.site.json` file on the file system.
 *
 * @param requestUri The request URI path.
 * @param rootDir An absolute path of the directory where to start looking for the site config.
 * @param minDepth Don't look for the site root at levels less than **N** below `rootDir`.
 * @param maxDepth Descend at most **N** levels of directories below `rootDir` when
 *   looking for the site root.
 * @return URI prefix of the site root (with a leading and trailing slash), or `null` if not found.
 */
export function findSiteRootUri (
  requestUri: string,
  rootDir: string,
  minDepth: number,
  maxDepth: number,
): string | null {
  const subdirs = requestUri.split('/', maxDepth + 1)
  const subdirsLen = subdirs.length

  for (let depth = 0, path = '/'; depth < subdirsLen; path += subdirs[++depth] + '/') {
    if (depth >= minDepth && pathExists(`${rootDir}${path}${SITE_CONFIG_NAME}`)) {
      return path
    }
  }
  return null
}

/**
 * @param requestUri The request URI path (e.g. `/site1/index.html`).
 * @param siteRootUri Prefix of the site (e.g. `/site1/` or `/`). It must include a trailing slash!
 * @return A tuple of branch name (`undefined` if not present) and URI path after the branch.
 */
export function splitUriToBranchAndPagePath (
  requestUri: string,
  siteRootUri: string,
): [branch: string | undefined, path: string] {
  const path = requestUri.slice(siteRootUri.length - 1)

  if (path[1] !== '@') {
    return [undefined, path]
  }
  const slashIdx = path.indexOf('/', 1)
  if (slashIdx < 3) {
    return [undefined, path]
  }
  return [path.slice(2, slashIdx), path.slice(slashIdx)]
}

/**
 * Returns an access rule that matches the specified `uri` and `branch`.
 *
 * @param config Configuration of the site.
 * @param branch Name of the branch.
 * @param uri The request URI without the site prefix and branch.
 * @param fallbackPolicy A {@link BasicRole}, business role or username to _allow_ if no
 *   matching access rule is found; or `'DENY'` to return an empty allow rule (denies all).
 */
export function resolveAccessRule (
  config: SiteConfig,
  branch: string,
  uri: string,
  fallbackPolicy = 'DENY',
): AccessRule {
  const { access } = config

  const branchKey = access && Object.keys(access).find(glob => {
    return glob === branch || globMatch(glob, branch)
  })
  if (branchKey) {
    const pathKey = Object.keys(access![branchKey]).find(glob => globMatch(glob, uri))

    if (pathKey) {
      return access![branchKey][pathKey]
    }
  }
  return {
    allow: fallbackPolicy === 'DENY' ? [] : [fallbackPolicy],
  }
}

export function isAnonymousAllowed (rule: AccessRule): boolean {
  return !!rule.allow?.includes(BasicRole.ANONYMOUS)
    && !rule.deny?.includes(BasicRole.ANONYMOUS)
}

export function isUserAllowed (rule: AccessRule, { username, roles }: User): boolean {
  if (rule.deny?.length) {
    const deny = toLookupTable(rule.deny)
    if (username in deny || roles.some(role => role in deny)) {
      return false
    }
  }
  if (rule.allow?.length) {
    const allow = toLookupTable(rule.allow)
    if (BasicRole.ANONYMOUS in allow || BasicRole.AUTHENTICATED in allow) {
      return true
    }
    if (username in allow || roles.some(role => role in allow)) {
      return true
    }
  }
  return false
}

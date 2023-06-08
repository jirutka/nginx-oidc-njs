import type { AccessRule } from './access'
import { globMatch, pathExists, readJSON } from './utils'


export interface SiteConfig {
  /**
   * The domain name on which the site should be available.
   */
  domain?: string,
  /**
   * Access rules.
   */
  access?: BranchAccessRules[]
}

// XXX: We have to use this unnecessarily verbose structure instead of just
//  nested objects with branch and path as keys due to
//  https://github.com/nginx/njs/issues/189.
interface BranchAccessRules {
  branch: string,
  rules: PathAccessRule[],
}

interface PathAccessRule extends AccessRule {
  /**
   * A glob pattern specifying the page paths to which the rule applies.
   * Subpages are implicitly included, so there is no need to specify them
   * further. The path must start with `/` and it's relative to the site root.
   */
  path: string
}

// A special directory (or symlink) for "root sites" - a site of the namespace.
// It's effectively like merging ./__ROOT__/* into ./.
const ROOT_SITE_PREFIX = '__ROOT__/'

// Name of file site config file that denotes the site's root directory (where
// `@<branch>` directories are located).
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
  // TODO: This looks hack-ish, figure out a better way.
  const maxDepth2 = Math.min(subdirsLen, maxDepth - 1)
  for (let depth = 0, path = '/'; depth < maxDepth2; path += subdirs[++depth] + '/') {
    if (depth >= minDepth && pathExists(`${rootDir}${path}${ROOT_SITE_PREFIX}${SITE_CONFIG_NAME}`)) {
      return path + ROOT_SITE_PREFIX
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
  let prefixLen = siteRootUri.length - 1

  if (siteRootUri.endsWith(ROOT_SITE_PREFIX)) {
    prefixLen -= ROOT_SITE_PREFIX.length
  }
  const argsIdx = requestUri.indexOf('?', prefixLen)
  const path = requestUri.slice(prefixLen, argsIdx >= 0 ? argsIdx : undefined) || '/'

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

  const { rules } = access && access.find(rule => {
    return rule.branch === branch || globMatch(rule.branch, branch)
  }) || {}

  if (rules) {
    const rule = rules.find(rule => globMatch(rule.path, uri))
    if (rule) {
      return {
        allow: rule.allow ?? [],
        deny: rule.deny ?? [],
      }
    }
  }

  return {
    allow: fallbackPolicy === 'DENY' ? [] : [fallbackPolicy],
    deny: [],
  }
}

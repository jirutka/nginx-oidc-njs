import { ALLOW_AUTHENTICATED, BasicRole } from './access'
import { createConfigReader, DeriveConfigType } from './config-reader'
import { SetCookieAttrs, parseCookieAttrs } from './cookie'
import { parseLogLevel, LogLevel } from './logger'
import { splitWhitespace } from './utils'


const configDescriptor = {
  issuer: undefined,
  authorizationEndpoint: undefined,
  endSessionEndpoint: '',
  clientId: undefined,
  clientSecret: undefined,
  scope: 'openid',
  claimRoles: '',
  claimUsername: 'preferred_username',
  redirectUri: '/-/oidc/callback',
  postLogoutRedirectUri: '',
  internalLocationsPrefix: '/-/internal',
  cookieAttrs: {
    // max-age=2592000; path=/; secure; samesite=lax
    // NOTE: samesite=strict doesn't work with e.g. Microsoft ATP (that crap
    //  used when opening links from MS Teams).
    default: {
      maxAge: 2592000,  // 30 days
      path: '/',
      secure: true,
      sameSite: 'lax',
    } as SetCookieAttrs,
    parser: parseCookieAttrs,
  },
  logLevel: {
    default: LogLevel.error,
    parser: parseLogLevel,
  },
  logPrefix: '[oidc] ',
  errorPagesDir: '',
  allow: {
    default: ALLOW_AUTHENTICATED,
    parser: splitWhitespace,
  },
  deny: {
    default: [] as readonly string[],
    parser: splitWhitespace,
  },
  pagesDefaultBranch: 'master',
  pagesMinDepth: 0,
  pagesMaxDepth: 3,
  pagesFallbackPolicy: BasicRole.AUTHENTICATED as string,
}

export type Config = DeriveConfigType<typeof configDescriptor>

export const configReader = createConfigReader(configDescriptor, 'oidc_')

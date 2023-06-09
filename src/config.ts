import { ALLOW_AUTHENTICATED, BasicRole } from './access'
import { createConfigReader, DeriveConfigType } from './config-reader'
import { parseLogLevel, LogLevel } from './logger'
import { splitWhitespace } from './utils'


const configDescriptor = {
  issuer: undefined,
  authorizationEndpoint: undefined,
  clientId: undefined,
  scope: 'openid',
  claimRoles: '',
  claimUsername: 'preferred_username',
  redirectUri: '/-/oidc/callback',
  internalLocationsPrefix: '/-/internal',
  cookieAttrs: 'SameSite=Strict',
  cookieMaxAge: 2592000,  // 30 days
  cookiePath: '/',
  insecure: false,
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

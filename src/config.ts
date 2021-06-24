import { createConfigReader, DeriveConfigType } from './config-reader'
import { BasicRole } from './pages'
import { parseLogLevel, LogLevel } from './logger'


const configDescriptor = {
  serverUrl: undefined,
  clientId: undefined,
  scope: '',
  redirectUri: '/-/oauth/callback',
  internalLocationsPrefix: '/-/internal',
  cookieAttrs: 'SameSite=Strict',
  cookieCipherKey: undefined,
  cookieMaxAge: 2592000,  // 30 days
  cookiePath: '/',
  cookiePrefix: 'oauth',
  insecure: false,
  logLevel: {
    default: LogLevel.error,
    parser: parseLogLevel,
  },
  logPrefix: '[oauth] ',
  errorPagesDir: '',
  accessAllowAnonymous: false,
  pagesDefaultBranch: 'master',
  pagesMinDepth: 0,
  pagesMaxDepth: 3,
  pagesFallbackPolicy: BasicRole.AUTHENTICATED as string,
}

export type Config = DeriveConfigType<typeof configDescriptor>

export const configReader = createConfigReader(configDescriptor, 'oauth_')

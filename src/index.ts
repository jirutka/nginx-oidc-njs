import { createConfigReader } from './config-reader'
import { createNginxHandlers, Context as TContext, RequestHandler as TRequestHandler } from './context'
import { BasicRole } from './pages'
import * as handlers from './handlers'
import { parseLogLevel, LogLevel } from './logger'
import { parseBoolean, ValuesExclude } from './utils'


const configTemplate = {
  serverUrl: undefined as string | undefined,
  clientId: undefined as string | undefined,
  scope: '',
  redirectUri: '/-/oauth/callback',
  internalLocationsPrefix: '/-/internal',
  cookieCipherKey: undefined as string | undefined,
  cookieMaxAge: 2592000,  // 30 days
  cookiePath: '/',
  cookiePrefix: 'oauth',
  insecure: false,
  logLevel: LogLevel.error,
  logPrefix: '[oauth] ',
  errorPagesDir: '',
  pagesDefaultBranch: 'master',
  pagesMinDepth: 0,
  pagesMaxDepth: 3,
  pagesFallbackPolicy: BasicRole.AUTHENTICATED as string,
}

const configConverter = {
  insecure: parseBoolean,
  logLevel: parseLogLevel,
  pagesMaxDepth: parseInt,
  pagesMinDepth: parseInt,
}

export type Config = ValuesExclude<typeof configTemplate, undefined>
export type Context = TContext<Config>
export type RequestHandler = TRequestHandler<Config>

const configReader = createConfigReader('oauth_', configTemplate, configConverter)

export default createNginxHandlers(handlers, configReader)

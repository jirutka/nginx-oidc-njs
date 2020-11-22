import { createConfigReader } from './config-reader'
import { createNginxHandlers, Context as TContext, RequestHandler as TRequestHandler } from './context'
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
}

const configConverter = {
  insecure: parseBoolean,
  logLevel: parseLogLevel,
}

export type Config = ValuesExclude<typeof configTemplate, undefined>
export type Context = TContext<Config>
export type RequestHandler = TRequestHandler<Config>

const configReader = createConfigReader('oauth_', configTemplate, configConverter)

export default createNginxHandlers(handlers, configReader)

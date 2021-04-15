import { configReader, Config } from './config'
import { createNginxHandlers, Context as TContext, RequestHandler as TRequestHandler } from './context'
import * as handlers from './handlers'

export type { Config }
export type Context = TContext<Config>
export type RequestHandler = TRequestHandler<Config>

export default createNginxHandlers(handlers, configReader)

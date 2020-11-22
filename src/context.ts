import qs from 'querystring'
import type { ParsedUrlQueryInput } from 'querystring'

import type { ConfigReader } from './config-reader'
import { createLogger, Logger, LoggerConfig } from './logger'


type HttpMethod = Exclude<NginxSubrequestOptions['method'], undefined>

type QueryParams = ParsedUrlQueryInput | string

type NginxRequestHandler = (req: NginxHTTPRequest) => void

export type RequestHandler<TConfig = BaseConfig> = (ctx: Context<TConfig>) => void | Promise<void>

/**
 * Request handler's context, an abstraction over `NginxHTTPRequest`.
 */
export interface Context<TConfig> {
  /**
   * Configuration properties read from nginx variables.
   */
  readonly conf: TConfig

  /**
   * The logger.
   */
  readonly log: Logger

  /**
   * The underlying HTTP request object.
   */
  readonly req: NginxHTTPRequest

  /**
   * Nginx variables.
   */
  readonly vars: NginxVariables

  /**
   * Type of the request handler. Defaults to `'location'`.
   *
   * When `'auth_request'` is used, `fail()` function sends error object via header
   * `X-Error` instead of request body.
   */
  handlerType: 'auth_request' | 'location'

  /**
   * Returns value of the named cookie.
   *
   * @param name Name of the cookie.
   * @param unescape Whether to unescape the cookie value. Defaults to `false`.
   */
  getCookie: (name: string, unescape?: boolean) => NjsStringLike | undefined

  /**
   * Logs error and sends an error response to the client.
   *
   * @param status The HTTP status code.
   * @param title  A short, human-readable summary of the error (per RFC 7807).
   * @param detail An optional human-readable explanation specific to this occurrence of the error.
   * @param headers An optional object with headers to be sent to the client.
   */
  fail (status: number, title: string, detail?: string, headers?: NginxHeadersOut): void
  /**
   * Logs error and sends an error response to the client.
   *
   * @param error An error object.
   */
  fail (error: HttpError | Error): void

  /**
   * Performs an internal redirect to the specified `uri`. If the `uri` starts with the
   * `@` prefix, it is considered a named location. If `query` object is provided, it's
   * stringified using `querystring.stringify` and appended to the `uri`.
   *
   * The actual redirect happens after the handler execution is completed.
   */
  internalRedirect: (uri: string, query?: QueryParams, headers?: NginxHeadersOut) => void

  /**
   * Sends the entire response with the specified `status`, body and `headers` to the client.
   * It is possible to specify either a `location` URI (for codes 301, 302, 303, 307,
   * and 308) or the response `body` text (for other codes).
   */
  send: (status: number, body?: NjsStringLike, headers?: NginxHeadersOut) => void

  /**
   * Creates a subrequest with the given options.
   *
   * A subrequest shares its input headers with the client request. To send headers different
   * from original headers to a proxied server, the `proxy_set_header` directive can be used.
   * To send a completely new set of headers to a proxied server, the
   * `proxy_pass_request_headers` directive can be used.
   *
   * @param method The HTTP method.
   * @param locationUri The subrequest location.
   * @param query An object with query parameters (values will be escaped) or an escaped query string.
   * @param body The subrequest body.
   */
  subrequest: (
    method: HttpMethod, locationUri: string, query?: QueryParams, body?: NjsStringLike,
  ) => Promise<NginxHTTPRequest>
}

/**
 * HTTP error response compatible with [RFC7807](https://tools.ietf.org/html/rfc7807).
 */
export interface HttpError {
  [key: string]: any

  status: number
  title: string
  detail?: string
  trackId?: string

  /** @internal */
  headers?: NginxHeadersOut
}

/**
 * Tests if the given `obj` is a `HttpError`, i.e. if it has `status` and `title`.
 */
export function isHttpError (obj: any): obj is HttpError {
  return typeof obj === 'object'
    && typeof obj.status === 'number'
    && typeof obj.title === 'string'
}

type BaseConfig = LoggerConfig & { [key: string]: any }

/**
 * Transforms the given request `handlers` that accepts `Context` into raw handlers
 * accepting `NginxHTTPRequest`.
 *
 * @param handlers A plain object with request handlers indexed by name.
 * @param configReader A function that accepts `NginxHTTPRequest` and returns
 *   a configuration object.
 */
export const createNginxHandlers = <TConfig extends BaseConfig> (
  handlers: Record<string, RequestHandler<TConfig>>,
  configReader: ConfigReader<TConfig>,
) => Object.keys(handlers).reduce<Record<string, NginxRequestHandler>>((acc, key) => {
  const handler = handlers[key]

  acc[key] = (req) => invokeHandler(handler, createContext(req, configReader(req)))
  return acc
}, {})

function invokeHandler <T> (handler: RequestHandler<T>, ctx: Context<T>): void {
  try {
    const res = handler(ctx)
    if (res && typeof res.catch === 'function') {
      res.catch(ctx.fail)
    }
  } catch (err) {
    ctx.fail(err)
  }
}

const createContext = <TConfig extends BaseConfig = BaseConfig> (
  req: NginxHTTPRequest,
  conf: TConfig,
): Context<TConfig> => {
  const self: Context<TConfig> = {
    conf,
    req,
    vars: req.variables,
    handlerType: 'location',

    log: createLogger(req, conf),

    getCookie: (name, unescape = false) => {
      const value = req.variables[`cookie_${name}`]
      return unescape && value ? qs.unescape(value) : value
    },

    fail: (statusOrError: number | HttpError | Error, title?: string, detail?: string, headers?: NginxHeadersOut) => {
      const body: HttpError =
        typeof statusOrError === 'number' ? { status: statusOrError, title: title!, detail }
        : isHttpError(statusOrError) ? statusOrError
        : { status: 500, title: 'OAuth Handler Error' }

      headers ??= body.headers
      delete body.headers

      body.trackId = req.variables.request_id

      const { status } = body
      const level = status >= 500 ? 'error' : 'warn'

      self.log[level]?.(`${status} ${body.title}: ${body.detail}`)
      if (statusOrError instanceof Error && statusOrError.stack) {
        self.log.error(statusOrError.stack)
      }

      setHeadersOut(req, headers)

      if (self.handlerType === 'auth_request') {
        // TODO: Remove after njs 0.4.5 or 0.5.0 is released.
        if (!body.detail) {
          delete body.detail
        }
        req.headersOut['X-Error'] = qs.stringify(body)
        // NOTE: req.return() doesn't work here.
        req.status = 403
        req.sendHeader()
        return req.finish()

      } else {
        req.headersOut['Content-Type'] = 'application/problem+json'
        return req.return(status, JSON.stringify(body) + '\n')
      }
    },

    internalRedirect: (uri, query, headers) => {
      setHeadersOut(req, headers)

      const args = typeof query === 'object'
        ? qs.stringify(query)
        : query

      return req.internalRedirect(args ? `${uri}?${args}` : uri)
    },

    send: (status, body, headers) => {
      if (headers) {
        setHeadersOut(req, headers)
      }
      return req.return(status, body)
    },

    subrequest: (method, locationUri, query, body) => {
      return req.subrequest(locationUri, {
        args: typeof query === 'object' ? qs.stringify(query) : query,
        body,
        method,
      })
    },
  }
  return self
}

function setHeadersOut (req: NginxHTTPRequest, headers?: NginxHeadersOut): void {
  if (!headers) return

  for (const name of Object.keys(headers)) {
    req.headersOut[name] = headers[name]
  }
}

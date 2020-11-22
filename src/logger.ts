
export enum LogLevel {
  error = 0,
  warn = 1,
  info = 2,
  debug = 3,
}

export interface Logger {
  /**
   * A function that logs the `message` to the nginx error log if the module's
   * _debug_ level is enabled, otherwise `undefined`.
   *
   * @example
   *   log.debug?.(`This will be evaluated only when debug leve is enabled: ${random()}`)
   */
  debug?: (message: string) => void
  /**
   * A function that logs the `message` to the nginx error log if the module's
   * _info_ level is enabled, otherwise `undefined`.
   */
  info?: (message: string) => void
  /**
   * A function that logs the `message` to the nginx error log if the module's
   * _warn_ level is enabled, otherwise `undefined`.
   */
  warn?: (message: string) => void
  /**
   * Logs the `message` to the nginx error log.
   */
  error: (message: string) => void
}

export interface LoggerConfig {
  logLevel: LogLevel
  logPrefix: string
}

export function parseLogLevel (value: string): LogLevel {
  const level = LogLevel[value as any]

  if (typeof level === 'number') {
    return level
  }
  throw RangeError(`Invalid log level: ${value}`)
}

/**
 * Creates a `Logger` object with a logging function for each logging level equal to
 * or higher than `logLevel`.
 */
export function createLogger (req: NginxHTTPRequest, { logLevel, logPrefix}: LoggerConfig): Logger {
  const logFunc = (prefix: string) => (msg: string) => req.error(prefix + msg)

  return {
    debug: logLevel >= LogLevel.debug ? logFunc(logPrefix + '[debug] ') : undefined,
    info: logLevel >= LogLevel.info ? logFunc(logPrefix + '[info] ') : undefined,
    warn: logLevel >= LogLevel.warn ? logFunc(logPrefix + '[warn] ') : undefined,
    error: logFunc(logPrefix + '[error] '),
  }
}

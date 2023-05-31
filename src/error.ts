
/**
 * HTTP error response compatible with [RFC7807](https://tools.ietf.org/html/rfc7807).
 */
export interface HttpError {
  [key: string]: any;

  status: number;
  title: string;
  detail?: string;
  trackId?: string;

  /** @internal */
  headers?: NginxHeadersOut;
}

/**
 * Creates an `HttpError` object containing the given properties.
 */
export function HttpError (
  status: number,
  title: string,
  detail?: string,
  headers?: NginxHeadersOut,
): HttpError {
  return { status, title, detail, headers }
}

/**
 * Tests if the given `obj` is a `HttpError`, i.e. if it has `status` and `title`.
 */
export function isHttpError (obj: any): obj is HttpError {
  return typeof obj === 'object'
    && typeof obj.status === 'number'
    && typeof obj.title === 'string';
}

/**
 * Returns a rejected Promise with object containing the given properties.
 */
export function reject (
  status: number,
  title: string,
  detail?: string,
  headers?: NginxHeadersOut,
): Promise<never> {
  return Promise.reject({ status, title, detail, headers } as HttpError)
}

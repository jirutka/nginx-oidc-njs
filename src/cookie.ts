import { splitWithLimit } from './utils'


/** `Set-Cookie` attributes without the cookie name and value. */
export interface SetCookieAttrs {
  /** Defines the host to which the cookie will be sent. */
  domain?: string
  /** Indicates the maximum lifetime of the cookie as an HTTP-date timestamp. */
  expires?: string
  /** Forbids JavaScript from accessing the cookie. */
  httpOnly?: boolean
  /** Indicates the number of seconds until the cookie expires. */
  maxAge?: number
  /**
   * Indicates the path that must exist in the requested URL for the browser
   * to send the Cookie header.
   */
  path?: string
  /** Controls whether or not a cookie is sent with cross-site requests. */
  sameSite?: 'strict' | 'lax' | 'none'
  /**
   * Indicates that the cookie is sent to the server only when a request is
   * made with the `https:` scheme (except on localhost).
   */
  secure?: boolean
}

/**
 * Formats a `Set-Cookie` string.
 *
 * **Note:** It does **not** URL-encode, quote or otherwise sanitize the values!
 *
 * @example
 * formatCookie('username', 'flynn', { maxAge: 3600, secure: true })
 * //=> 'username="flynn"; max-age=3600; secure'
 */
export function formatCookie (name: string, value: string, attrs: SetCookieAttrs = {}): string {
  let str = `${name}=${value}`

  // Note: This is more efficient than `Object.entries()`.
  for (const k of Object.keys(attrs) as Array<keyof SetCookieAttrs>) {
    const v = attrs[k]
    if (v == null || v === false) {
      // skip
    } else if (v === true) {
      str += `; ${k}`
    } else if (k === 'maxAge') {
      str += `; max-age=${v}`
    } else {
      str += `; ${k}=${v}`
    }
  }
  return str
}

/**
 * Formats a `Set-Cookie` string that will clear (remove) the named cookie.
 *
 * @example
 * formatCookieClear('username', { maxAge: 3600, secure: true })
 * //=> 'username=""; max-age=0; secure'
 */
export function formatCookieClear (name: string, attrs: SetCookieAttrs = {}): string {
  return formatCookie(name, '', { ...attrs, maxAge: 0 })
}

/**
 * Parses Set-Cookie attributes string into an object.
 *
 * **Note**: It does not URL-decode the values nor remove the quotes around
 * quoted values.
 *
 * @throws {TypeError} if `value` contains an invalid (unknown) attribute.
 *
 * @example
 * parseCookieAttrs('max-age=3600; SameSite=Strict; Secure')
 * //=> { maxAge: 3600, sameSite: 'strict', secure: true }
 */
export function parseCookieAttrs (value: string): SetCookieAttrs {
  // Note: This is more efficient than for-each.
  return value.split(';').reduce<SetCookieAttrs>((obj, str) => {
    let [name, value] = splitWithLimit(str.trim(), '=', 2)

    switch ((name = name.toLowerCase())) {
      case 'httponly':
        obj.httpOnly = true
        return obj
      case 'max-age': case 'maxage':
        obj.maxAge = Number(value)
        return obj
      case 'samesite':
        // XXX: We don't validate the value here.
        obj.sameSite = value.toLowerCase() as any
        return obj
      case 'secure':
        obj.secure = true
        return obj
      case 'domain': case 'expires': case 'path':
        if (name) {
          (obj as any)[name] = value
        }
        return obj
      default:
        throw new TypeError(`Invalid Set-Cookie attribute: ${name}`)
    }
  }, {})
}

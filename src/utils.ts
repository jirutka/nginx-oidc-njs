import fs from 'fs'
import qs from 'querystring'
import type { ParsedUrlQueryInput } from 'querystring'

import type { HttpError } from './context'


/**
 * Tests if `value` is truthy and returns it. When it's not truthy, `Error` with `message`
 * is thrown.
 *
 * @throws if `value` is not truthy.
 */
export function assert <T> (value: T | undefined | null | false | 0 | '', message: string): T {
  if (!value) {
    throw Error(message)
  }
  return value
}

/**
 * Converts camelCase `str` into snake_case.
 *
 * Note: It works correctly with ASCII characters only!
 */
export function camelToSnake (str: string): string {
  // For shorter strings, this implementation is more efficient than using regex.
  const strLen = str.length
  let res = ''

  for (let i = 0; i < strLen; i++) {
    const char = str[i]
    res += (char >= 'A' && char <= 'Z') ? '_' + char.toLowerCase() : char
  }
  return res
}

type FormatCookieOpts = {
  cookieDomain?: string,
  cookiePath: string,
  insecure?: boolean,
}

/**
 * Formats a cookie for `Set-Cookie` header.
 *
 * @param name The cookie name.
 * @param value The cookie value.
 * @param maxAge Number of seconds until the cookie expires.
 * @param opts An object with:
 *   - `cookieDomain` - `Domain` attribute
 *   - `cookiePath` - `Path` attribute
 *   - `insecure` - if `true`, `SameSite=Strict; Secure` will **not** be set
 * @param extra Any extra attributes as string that will be appended to the cookie value.
 * @returns A cookie string.
 */
export function formatCookie (
  name: string,
  value: string,
  maxAge: number,
  opts: FormatCookieOpts,
  extra: string = '',
): string {
  if (!opts.insecure) {
    extra = `SameSite=Strict; Secure; ${extra}`
  }
  if (opts.cookieDomain) {
    extra = `Domain=${opts.cookieDomain}; ${extra}`
  }
  return `${name}=${value}; Path=${opts.cookiePath}; Max-Age=${maxAge};${extra}`
}

/**
 * Formats a cookie for `Set-Cookie` header that will clear (remove) the named cookie.
 *
 * @param name The cookie name.
 * @param opts An object with:
 *   - `cookiePath` - `Path` attribute
 *   - `insecure` - if `true`, `SameSite=Strict; Secure` will **not** be set
 * @returns A cookie string.
 */
export function formatCookieClear (name: string, opts: FormatCookieOpts): string {
  return formatCookie(name, '', 0, opts)
}

// This implementation is based on https://www.codeproject.com/Articles/5163931/Fast-String-Matching-with-Wildcards-Globs-and-Giti,
// variant Non-Recursive Glob Matching with support for character classes.
export function globMatch (glob: string, text: string): boolean {
  const textLen = text.length
  let ti = 0
  let gi = 0
  let tibak = -1
  let gibak = -1

  for (let tc = text[0], gc = glob[0]; ti < textLen; tc = text[ti], gc = glob[gi]) {
    switch (gc) {
      case '*':  // new star-loop: backup positions in pattern and text
        tibak = ti
        gibak = ++gi
        continue
      case '?':  // match any character except `/`
        if (tc === '/') {
          break
        }
        ti++
        gi++
        continue
      case '[': {
        if (tc === '/') {
          break
        }
        gc = glob[++gi]
        // Inverted character class.
        const inverted = gc === '^' || gc === '!'
        if (inverted) {
          gc = glob[++gi]
        }
        // Match character class.
        let matched = false
        for (let lastCh = ''; gc && gc !== ']'; lastCh = gc, gc = glob[++gi]) {
          if (lastCh && gc === '-' && glob[gi + 1] && glob[gi + 1] !== ']') {
            if (tc >= lastCh && tc <= glob[++gi]) {
              matched = true
            }
          } else if (tc === gc) {
            matched = true
          }
        }
        if (matched === inverted) {
          break  // not matched
        }
        ti++
        gi++
        continue
      }
      // @ts-ignore falls through
      case '\\':  // literal match \-escaped character
        gc = glob[++gi]
      default:
        // Match the current character.
        if (gc !== tc && !(gc === '/' && tc === '/')) {
          break
        }
        ti++
        gi++
        continue
    }
    if (gibak >= 0 && text[tibak] !== '/') {
      // star-loop: backtrack to the last `*` but do not jump over `/`
      ti = ++tibak
      gi = gibak
      continue
    }
    // Treat trailing `/` in glob as `/**`.
    if (glob[gi - 1] === '/' && text[ti - 1] === '/') {
      break
    }
    return false
  }
  // Ignore trailing stars.
  while (glob[gi] === '*') {
    gi++
  }
  return gi >= glob.length
}

/**
 * Returns `true` if the `path` exists (i.e. it's a file or directory),
 * otherwise `false`.
 */
export function pathExists (path: string): boolean {
  try {
    fs.accessSync(path)
    return true
  } catch (err) {
    return false
  }
}

/**
 * Returns `true` if `value` is `'true'`.
 */
export const parseBoolean = (value: string): boolean => value === 'true'

/**
 * Converts the given `body` into a JSON.
 *
 * @throws {TypeError} if `body` is unset or not a valid UTF8 string.
 * @throws {SyntaxError} if `body` is not a valid JSON.
 */
export function parseJsonBody (body?: NjsByteString): object {
  if (body == null) {
    throw TypeError('requestBody has not been read')
  }
  const str = body?.toUTF8()
  if (str == null) {
    throw TypeError('requestBody is not a valid UTF8 string')
  }
  return JSON.parse(str)
}

/**
 * Parses `Accept` header and returns the most preferred media type from the list
 * of supportedTypes.
 *
 * Note: This function is extremely simplified, it does not support q-values,
 * suffixes, charsets etc. It just compares naked media type without parameters
 * and returns the first match.
 */
export function preferredMediaType <T extends readonly string[]> (
  acceptQuery: string,
  supportedTypes: T,
): T[number] {
  for (let type of acceptQuery.split(',')) {
    type = substrBefore(type, ';').trim()
    if (supportedTypes.includes(type)) {
      return type
    }
  }
  return supportedTypes[0]
}

/**
 * Returns a random alphanumeric string of the specified `length`.
 */
export function random (length = 8, radix = 32): string {
  let res = ''
  while (length--) {
    res += Math.floor(Math.random() * radix).toString(radix)
  }
  return res
}

/**
 * Reads and parses JSON file at `filepath`.
 */
export function readJSON (filepath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'))
  } catch (err) {
    err.message = `${filepath}: ${err.message}`
    throw err
  }
}

/**
 * Returns a rejected Promise with object containing the given properties.
 */
export function reject (status: number, title: string, detail?: string, headers?: NginxHeadersOut): Promise<never> {
  return Promise.reject({ status, title, detail, headers } as HttpError)
}

/**
 * Renders the given `template` with parameters enclosed in double curly braces:
 * `{{ varName }}`.
 */
export function renderTemplate (template: string, params: Record<string, unknown>): string {
  return template.replace(
    /\{\{\s*([A-Za-z0-9_$]+)\s*\}\}/g,
    (_, varName: string) => String(params[varName] ?? ''),
  )
}

/**
 * Creates a null object with the given `keys` set to `true`.
 */
export function toLookupTable <T extends readonly string[]> (keys: T): Record<T[number], true> {
  return keys.reduce<Record<T[number], true>>((acc, key: T[number]) => {
    acc[key] = true
    return acc
  }, Object.create(null))
}

/**
 * Constructs URL from given `uri` (without query string and fragment) and `query` object.
 */
export function url (uri: string, query: ParsedUrlQueryInput): string {
  return `${uri}?${qs.stringify(query)}`
}

function substrBefore (str: string, searchStr: string): string {
  const idx = str.indexOf(searchStr)
  return idx > 0 ? str.slice(idx) : str
}

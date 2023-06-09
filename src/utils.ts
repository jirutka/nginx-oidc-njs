import webCrypto from 'crypto'
import fs from 'fs'
import qs from 'querystring'
import type { ParsedUrlQueryInput } from 'querystring'


/**
 * Constructs an absolute URL from the given `uri` path and object containing
 * `scheme`, `host`, and `server_port`. If the `url` starts with `https://` or
 * `http://`, it's returned as-is.
 *
 * **Note:** This function just concatenates strings, it does not normalize the
 * path nor check if it's valid!
 */
export function absoluteUrl (uri: string, vars: Pick<NginxVariables, 'host' | 'scheme' | 'server_port'>): string {
  if (uri.startsWith('https://') || uri.startsWith('http://')) {
    return uri
  }
  const { scheme, host, server_port } = vars
  const port = scheme === 'https' && server_port === '443' ? '' : `:${server_port}`

  return `${scheme}://${host}${port}${uri}`
}

type Arrify<T> = T extends (null | undefined) ? [] : T extends readonly unknown[] ? T : T[]

/**
 * @example
 * arrify('foo')      //=> ['foo']
 * arrify(['a', 'b']) //=> ['a', 'b']
 * arrify(undefined)  //=> []
 * arrify(null)       //=> []
 */
export function arrify <T> (value: T): Arrify<T> {
  return value == null ? []
    : Array.isArray(value) ? value
    : [value] as any
}

/**
 * Tests if `value` is truthy and returns it. When it's not truthy, `Error` with `message`
 * is thrown.
 *
 * @throws if `value` is not truthy.
 */
export function assert <T> (value: T | undefined | null | false | 0 | '', message: string): T {
  if (!value) {
    throw new Error(message)
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

/**
 * Returns the path component of the given `url`. It expects an URL with
 * `http://` or `https://` schema or without schema and domain part. The query
 * and fragment component is stripped.
 */
export function extractUrlPath (url: string): string {
  return url.match(/^https?:\/\/[^/\s]+(\/[^?#\s]+)/)?.[1] ?? url
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
 * Returns `true` if the given `value` represents a positive integer, i.e. it
 * can be converted to an integer and it's `>= 1`.
 */
export function isPositiveInteger (value: unknown): boolean {
  const num = Number(value)
  return Number.isInteger(num) && num > 0
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
 * @throws {TypeError} if `body` is unset or not a valid UTF-8 string.
 * @throws {SyntaxError} if `body` is not a valid JSON.
 */
export function parseJsonBody (body?: Buffer): object {
  if (body == null) {
    throw new TypeError('requestBody has not been read')
  }
  let str: string
  try {
    str = new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch (err: any) {
    throw new TypeError(`unable to decode requestBody as UTF-8 string: ${err.message}`)
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
 * Returns a cryptographically secure random hex string of `bits` length.
 */
export function randomString (bits: number): string {
  const array = crypto.getRandomValues(new Uint8Array(Math.floor(bits / 8)))
  return Buffer.from(array).toString('hex')
}

/**
 * Reads and parses JSON file at `filepath`.
 */
export function readJSON (filepath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'))
  } catch (err: any) {
    err.message = `${filepath}: ${err.message}`
    throw err
  }
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
 * Returns a SHA-256 digest encoded in hex of the given `data`.
 */
export function sha256 (data: NjsStringOrBuffer): string {
  return webCrypto.createHash('sha256').update(data).digest('hex')
}

/**
 * Splits `str` by whitespace.
 */
export function splitWhitespace (str: string): string[] {
  return str.split(/\s+/)
}

/**
 * Splits `str` into substrings using the specified `separator` and returns them
 * as an array. Unlike `String.prototype.split()`, the function stops splitting
 * the string after `limit - 1` occurrence of the separator, i.e. the last
 * element of the array contains the remaining of the string.
 *
 * @example
 * split('foo bar baz', 2)  //=> ['foo', 'bar baz']
 */
export function splitWithLimit (str: string, separator: string, limit: number): string[] {
  let idx
  let lastIdx = 0
  let res = []

  while (--limit && (idx = str.indexOf(separator, lastIdx)) >= 0) {
    res.push(str.substring(lastIdx, idx))
    lastIdx = idx + separator.length
  }

  if (lastIdx < str.length) {
    res.push(str.substring(lastIdx))
  }

  return res
}

/**
 * Returns the current unix timestamp in seconds.
 */
export const timestamp = () => Math.floor(Date.now() / 1000)

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
  return idx > 0 ? str.slice(0, idx) : str
}

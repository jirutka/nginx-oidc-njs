import crypto from 'node:crypto'


type Arrify<T> = T extends (null | undefined) ? [] : T extends readonly unknown[] ? T : T[]

export function arrify <T> (value: T): Arrify<T> {
  return value == null ? []
    : Array.isArray(value) ? value
    : [value] as any
}

export function randomString (length = 5): string {
  let str = ''
  while (str.length < length) {
    str += (Math.random() + 1).toString(36).substring(2, 7)
  }
  return str.substring(0, length)
}

export function removeBy <T> (array: T[], predicate: (item: T) => boolean): number {
  let n = 0
  let idx = -1
  while ((idx = array.findIndex(predicate)) >= 0) {
    array.splice(idx, 1)
    n++
  }
  return n
}

// Keep in sync with sha256() in ../../src/utils.ts.
export function sha256 (value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function splitWithLimit (str: string, separator: string, limit: number): string[] {
  let idx = -1
  let lastIdx = 0
  const res = []

  while (--limit && (idx = str.indexOf(separator, lastIdx)) >= 0) {
    res.push(str.substring(lastIdx, idx))
    lastIdx = idx + separator.length
  }

  if (lastIdx < str.length) {
    res.push(str.substring(lastIdx))
  }

  return res
}

export function parseBasicAuthHeader (value: string): { username: string, password: string } | null {
  if (!value.startsWith('Basic ')) {
    return null
  }
  const decoded = Buffer.from(value.slice('Basic '.length), 'base64').toString()
  const [username, password] = splitWithLimit(decoded, ':', 2)

  return { username, password }
}

/**
 * Returns the current unix timestamp in seconds.
 */
export const timestamp = () => Math.floor(Date.now() / 1000)

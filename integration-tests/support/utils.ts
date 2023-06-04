import crypto from 'node:crypto'


export function arrify <T> (value: T | T[] | undefined | null): T[] {
  return value == null ? []
    : Array.isArray(value) ? value
    : [value]
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

export function hashCsrf (value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function parseBasicAuthHeader (value: string): { username: string, password: string } | null {
  if (!value.startsWith('Basic ')) {
    return null
  }
  const decoded = Buffer.from(value.slice('Basic '.length), 'base64').toString()
  const [username, password] = decoded.split(':', 2)

  return { username, password }
}

/**
 * Returns the current unix timestamp in seconds.
 */
export const timestamp = () => Math.floor(Date.now() / 1000)

import got, { ExtendOptions, Got } from 'got'
import { Cookie as ToughCookie, CookieJar as ToughCookieJar, Store } from 'tough-cookie'


export type { Options, Response } from 'got'

export interface Cookie {
  key: string
  value: string
  expires?: string
  maxAge?: number
  domain: string
  path: string
  secure?: boolean
  httpOnly?: boolean
  hostOnly?: boolean
  sameSite?: string
}

// CookieJar has quite impractical API, so let's add some more convenient methods.
class CookieJar extends ToughCookieJar {

  clear (): void {
    this.removeAllCookiesSync()
  }

  get (key: string): Cookie | undefined {
    const cookies = this.toJSON().cookies.filter(cookie => cookie.key === key) as Cookie[]

    if (cookies.length === 0) {
      return
    } else if (cookies.length > 1) {
      throw Error(`Found more than one cookie with key: ${key}`)
    }
    return cookies[0]
  }

  set (key: string, value: string, currentUrl: string, opts: Partial<Omit<Cookie, 'key' | 'value'>> = {}): Cookie {
    const cookie = ToughCookie.fromJSON({ ...opts, key, value })!

    return this.setCookieSync(cookie, currentUrl).toJSON() as Cookie
  }

  setAll (cookies: Array<Pick<Cookie, 'key' | 'value'> & Partial<Cookie>>, currentUrl: string): Cookie[] {
    return cookies.map(cookie => this.set(cookie.key, cookie.value, currentUrl, cookie))
  }

  remove (key: string): void {
    const store = (this as any).store as Store
    const cookies = this.toJSON().cookies.filter(cookie => cookie.key === key) as Cookie[]

    for (const { domain, path, key } of cookies) {
      store.removeCookie(domain, path, key, (err) => {
        if (err) throw err
      })
    }
  }
}

export interface HttpClient extends Got {
  cookies: CookieJar
}

export function createClient (opts: ExtendOptions = {}): HttpClient {
  const cookieJar = new CookieJar()

  const client = got.extend({ cookieJar, ...opts }) as HttpClient
  client.cookies = cookieJar

  return client
}

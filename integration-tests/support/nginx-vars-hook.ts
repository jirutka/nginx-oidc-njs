import createHttpError from 'http-errors'

import type { HttpClient, Options } from './http-client'
import { arrify } from './utils'


export interface NginxVarsHook {
  get: (name: string, httpOptions?: Options) => Promise<string | null>
  set: (name: string, value: string, httpOptions?: Options) => Promise<void>
  clear: (names: string | readonly string[], httpOptions?: Options) => Promise<void>
}

/**
 * Creates a helper that allows to get, set or clear nginx variables in runtime
 * via test-hook.js.
 */
export const createNginxVarsHook = (
  httpClient: HttpClient,
  baseUrl: string,
): NginxVarsHook => ({
  async get (name, opts = {}) {
    const res = await httpClient.get(`${baseUrl}/${name}`, {
      ...opts,
      isStream: false,
      resolveBodyOnly: false,
      responseType: 'text',
      throwHttpErrors: false,
    })
    switch (res.statusCode) {
      case 200: return res.body
      case 404: return null
      default: throw createHttpError(res.statusCode)
    }
  },
  async set (name, value, opts = {}) {
    await httpClient.put(`${baseUrl}/${name}`, {
      ...opts,
      body: value,
      headers: { 'Content-Type': 'text/plain' },
      throwHttpErrors: true,
    })
  },
  async clear (names, opts = {}) {
    // TODO: make arrify compatible with readonly
    await Promise.all(arrify(names as any).map(name => {
      return httpClient.delete(`${baseUrl}/${name}`, {
        ...opts,
        throwHttpErrors: true,
      })
    }))
  }
})

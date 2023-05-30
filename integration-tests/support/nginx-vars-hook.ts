import createHttpError from 'http-errors'

import { HttpClient } from './http-client'
import { arrify } from './utils'


export interface NginxVarsHook {
  get: (name: string) => Promise<string | null>
  set: (name: string, value: string) => Promise<void>
  clear: (names: string | readonly string[]) => Promise<void>
}

/**
 * Creates a helper that allows to get, set or clear nginx variables in runtime
 * via test-hook.js.
 */
export const createNginxVarsHook = (
  httpClient: HttpClient,
  baseUrl: string,
): NginxVarsHook => ({
  async get (name) {
    const res = await httpClient.get(`${baseUrl}/${name}`, {
      responseType: 'text',
      throwHttpErrors: false,
    })
    switch (res.statusCode) {
      case 200: return res.body
      case 404: return null
      default: throw createHttpError(res.statusCode)
    }
  },
  async set (name, value) {
    await httpClient.put(`${baseUrl}/${name}`, {
      body: value,
      headers: { 'Content-Type': 'text/plain' },
      throwHttpErrors: true,
    })
  },
  async clear (names) {
    // TODO: make arrify compatible with readonly
    await Promise.all(arrify(names as any).map(name => {
      return httpClient.delete(`${baseUrl}/${name}`, {
        throwHttpErrors: true,
      })
    }))
  }
})

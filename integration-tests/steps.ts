import assert from './support/assert'
import { defineSteps } from './support/shared-steps'


const oauthCookies = ['oauth_access_token', 'oauth_refresh_token', 'oauth_username'] as const

export default defineSteps({
  "I'm not logged in (no cookies are set)": ({ client }) => {
    client.cookies.clear()
  },
  "I'm logged in and all cookies are set": async ({ client, proxyUrl }) => {
    client.cookies.clear()

    await client.post(`${proxyUrl}/-/oauth/login`, { followRedirect: true })

    for (const cookieName of oauthCookies) {
      assert(client.cookies.get(cookieName))
    }
  },
  "I follow the redirect": async (ctx) => {
    ctx.resp = await ctx.client.get(ctx.resp.headers.location!)
  },
  "I make a GET request to proxy {path}": async (ctx, path: string) => {
    ctx.resp = await ctx.client.get(`${ctx.proxyUrl}${path}`)
  },
  "I make a POST request to proxy {path}": async (ctx, path: string) => {
    ctx.resp = await ctx.client.post(`${ctx.proxyUrl}${path}`)
  },

  "the response status should be {status}": ({ resp }, expectedStatus: number) => {
    assert(resp.statusCode === expectedStatus)
  },
  "the response should set cookie {cookieName}": ({ client }, cookieName: string) => {
    assert(client.cookies.get(cookieName))
  },
  "cookie {cookieName} should be cleared": ({ client }, cookieName: string) => {
    assert(!client.cookies.get(cookieName)?.maxAge)
  },
  "no OAuth cookies should be set": ({ client }) => {
    for (const cookieName of oauthCookies) {
      assert(!client.cookies.get(cookieName))
    }
  },
})

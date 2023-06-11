import assert from './support/assert'
import { defineSteps } from './support/shared-steps'

import { Cookie, Session } from '../src/constants'


const sessionCookies = [Cookie.SessionId, Cookie.Username]
const sessionVariables = [Session.AccessToken, Session.IdToken, Session.RefreshToken]

export default defineSteps({
  "I'm not logged in (no session and cookies exist)": ({ client, nginx }) => {
    client.cookies.clear()
    nginx.variables.clear(sessionVariables)
  },
  "I'm logged in (session and cookies are set)": async ({ client, nginx, proxyUrl }) => {
    client.cookies.clear()

    await client.post(`${proxyUrl}/-/oidc/login`, { followRedirect: true })

    for (const cookieName of sessionCookies) {
      assert(client.cookies.get(cookieName))
    }
    for (const varName of sessionVariables) {
      assert(await nginx.variables.get(varName))
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
  "session variable {varName} should be set": async ({ nginx }, varName: string) => {
    assert(await nginx.variables.get(varName))
  },
  "session variable {varName} should be cleared": async ({ nginx }, varName: string) => {
    assert(!await nginx.variables.get(varName))
  },
  "no session variables and OAuth cookies should be set": async ({ client, nginx }) => {
    for (const cookieName of sessionCookies) {
      assert(!client.cookies.get(cookieName))
    }
    for (const varName of sessionVariables) {
      assert(!await nginx.variables.get(varName))
    }
  },
})

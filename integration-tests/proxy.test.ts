import assert from './support/assert'

import { useOAuthServer, useResourceProvider } from './support/hooks'
import { describe, useSharedSteps } from './support/mocha'
import commonSteps from './steps'

import { Session } from '../src/constants'


describe('Proxy', () => {
  useOAuthServer()
  useResourceProvider()

  const { given, when, then, and } = useSharedSteps({
    ...commonSteps,
    "I make a request to a resource provider through the proxy": async (ctx) => {
      ctx.resp = await ctx.client.get(`${ctx.proxyUrl}/proxy/secured/ping`)
    },
    "I should get response from the resource provider": ({ resp }) => {
      assert(resp.statusCode === 200)
      assert.includes(resp.body, 'pong')
    },
  })


  describe('with no tokens', () => {
    given("I'm not logged in (no session and cookies exist)")

    when("I make a request to a resource provider through the proxy")

    then("the response status should be {status}", 401)

    and("the response should contain the WWW-Authenticate header", (ctx) => {
      assert(ctx.resp.headers['www-authenticate'] === 'Bearer error="unauthorized"')
    })
  })


  describe('with valid access token', () => {
    given("I'm logged in (session and cookies are set)")

    when("I make a request to a resource provider through the proxy")

    then("I should get response from the resource provider")
  })


  describe('with no access token and valid refresh token', () => {
    given("I'm logged in (session and cookies are set)")

    and("access token is missing from the session", async ({ nginx }) => {
      await nginx.variables.clear(Session.AccessToken)
    })

    when("I make a request to a resource provider through the proxy")

    then("I should get response from the resource provider")

    and("session variable {varName} should be set", Session.AccessToken)
  })
})

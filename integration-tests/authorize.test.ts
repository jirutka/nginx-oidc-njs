import assert from './support/assert'
import { useOAuthServer } from './support/hooks'
import { describe, useSharedSteps } from './support/mocha'
import { decodeJwtPayload, shiftJwtTimes } from './support/oauth-server'
import { timestamp } from './support/utils'
import commonSteps from './steps'

import { Session } from '../src/constants'


describe('Authorize', () => {
  const { given, when, then, and } = useSharedSteps({
    ...commonSteps,
    "I make a request to a secured page": async (ctx) => {
      ctx.resp = await ctx.client.get(`${ctx.proxyUrl}/secured/index.html`)
    },
    "I should get the requested page": ({ resp }) => {
      assert(resp.statusCode === 200)
      assert(resp.body.includes('<title>/secured/index.html</title>'))
    },
  })

  useOAuthServer()

  describe('with no id token', () => {

    describe('with no refresh token', () => {
      given("I'm not logged in (no session and cookies exist)")

      when("I make a request to a secured page")

      then("the proxy should redirect me to $oauth_server_url/authorize", ({ resp, oauthServerUrl }) => {
        assert(resp.statusCode === 303)
        assert(resp.headers.location!.split('?')[0] === `${oauthServerUrl}/authorize`)
      })
    })

    describe('with an invalid refresh token', () => {
      given("I'm logged in (session and cookies are set)")

      and("id token token is missing from the session", async ({ nginx }) => {
        await nginx.variables.clear(Session.IdToken)
      })

      and("refresh token is invalid", async ({ nginx }) => {
        await nginx.variables.set(Session.RefreshToken, 'invalid-refresh-token')
      })

      when("I make a request to a secured page")

      then("the response status should be {status}", 401)

      and("session variable {varName} should be cleared", Session.RefreshToken)
    })

    describe('with a valid refresh token', () => {
      given("I'm logged in (session and cookies are set)")

      and("id token token is missing from the session", async ({ nginx }) => {
        await nginx.variables.clear(Session.IdToken)
      })

      when("I make a request to a secured page")

      then("I should get the requested page")

      and("session variable {varName} should be set", Session.AccessToken)

      and("session variable {varName} should be set", Session.IdToken)
    })
  })

  describe('with expired id token', () => {
    given("I'm logged in (session and cookies are set)")

    and("id token in the session has expired", async ({ nginx, oauthServer }) => {
      const idToken = await nginx.variables.get(Session.IdToken)
      assert(idToken)

      const expiredIdToken = await shiftJwtTimes(oauthServer!.issuer, idToken, -7200)
      await nginx.variables.set(Session.IdToken, expiredIdToken)
    })

    when("I make a request to a secured page")

    then("I should get the requested page")

    and("session variable {varName} should be set", Session.AccessToken)

    and(`session variable ${Session.IdToken} should be set to a fresh id token`, async ({ nginx }) => {
      const idToken = await nginx.variables.get(Session.IdToken)
      assert(idToken)

      const payload = decodeJwtPayload(idToken)
      assert(payload.exp > timestamp())
    })
  })

  describe('with a valid id token', () => {
    given("I'm logged in (session and cookies are set)")

    when("I make a request to a secured page")

    then("I should get the requested page")
  })
})

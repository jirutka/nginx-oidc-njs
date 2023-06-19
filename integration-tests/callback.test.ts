import * as FS from 'node:fs'
import { URL, URLSearchParams } from 'node:url'

import assert from './support/assert'
import { useOAuthServer } from './support/hooks'
import { Cookie, CookieJar } from './support/http-client'
import { beforeEachSuite, describe, useSharedSteps } from './support/mocha'
import { randomString, sha256, timestamp } from './support/utils'
import commonSteps from './steps'

import type { AuthState } from '../src/oauth'
import { Cookie as CookieName, Session } from '../src/constants'


describe('Callback', () => {
  const originalUri = '/index.html'

  let stateId: string
  let nonce: string
  let stateCookie: Cookie | undefined

  beforeEachSuite(() => {
    stateId = randomString(32)
    nonce = randomString()
  })

  const { given, when, then, and } = useSharedSteps({
    ...commonSteps,
    "cookie with <stateId> is provided": async ({ client, proxyUrl }) => {
      stateCookie = client.cookies.set(CookieName.StateId, stateId, proxyUrl, {
        httpOnly: true,
        maxAge: 120,
        path: '/-/oidc/callback',
      })
    },
    "state object for <stateId> exists in the session store": async ({ nginx, proxyUrl }) => {
      assert(stateCookie, 'stateCookie must be set')

      await nginx.variables.set(Session.AuthState, JSON.stringify({
        exp: timestamp() + 120,
        nonce,
        url: originalUri,
      } as AuthState), {
        // We must modify the cookie's path to make it visible for the
        // /test-hook/variables/* resources.
        cookieJar: CookieJar.withCookies([{ ...stateCookie, path: '/' }], proxyUrl),
      })
    },
    "I make a GET request to the proxy's callback endpoint with a valid 'state' and {query}": async (ctx, query: string) => {
      ctx.resp = await ctx.client.get(
        `${ctx.proxyUrl}/-/oidc/callback?state=${sha256(stateId)}&${query}`)
    },
    "I make a GET request to the proxy's callback endpoint with a valid 'code' and 'state'": async (ctx) => {
      const code = await getValidAuthCode(ctx, stateId, nonce)
      ctx.resp = await ctx.client.get(
        `${ctx.proxyUrl}/-/oidc/callback?code=${code}&state=${sha256(stateId)}`)
    },
  })

  useOAuthServer()

  describe('with no query parameters', () => {
    when("I make a GET request to proxy {path}", '/-/oidc/callback')

    then("the response status should be {status}", 400)
  })

  describe('when state cookie is missing', () => {
    when("I make a GET request to the proxy's callback endpoint with a valid 'code' and 'state'")

    then("the response status should be {status}", 400)
  })

  describe("when state parameter does not match", () => {
    given("cookie with <stateId> is provided")

    and("state object for <stateId> exists in the session store")

    when("I make a GET request to the proxy's callback endpoint with a wrong 'state'", async (ctx) => {
      ctx.resp = await ctx.client.get(`${ctx.proxyUrl}/-/oidc/callback?code=xyx&state=wrong`)
    })

    then("the response status should be {status}", 400)
  })


  describe('when state parameter is correct', () => {

    describe('when state object is missing in the session store', () => {
      given("cookie with <stateId> is provided")

      when("I make a GET request to the proxy's callback endpoint with a valid 'code' and 'state'")

      then("the response status should be {status}", 400)
    })

    describe('when nonce in id_token and in session store does not match', () => {
      given("cookie with <stateId> is provided")

      and("state object for <stateId> exists in the session store")

      and("OP got a different nonce", () => {
        nonce = 'different-nonce'
      })

      when("I make a GET request to the proxy's callback endpoint with a valid 'code' and 'state'")

      then("the response status should be {status}", 400)
    })


    describe('when nonce is correct', () => {

      describe('with error=access_denied', () => {
        given("cookie with <stateId> is provided")

        and("state object for <stateId> exists in the session store")

        when("I make a GET request to the proxy's callback endpoint with a valid 'state' and {query}",
             'error=access_denied')

        then("the response status should be {status}", 403)

        and("cookie {cookieName} should be cleared", CookieName.StateId)
      })

      ;['server_error', 'temporarily_unavailable'].forEach(error => {
        describe(`with error=${error}`, () => {
          given("cookie with <stateId> is provided")

          and("state object for <stateId> exists in the session store")

          when("I make a GET request to the proxy's callback endpoint with a valid 'state' and {query}",
               `error=${error}`)

          then("the response status should be {status}", 502)
        })
      })

      describe('with an invalid code', () => {
        given("cookie with <stateId> is provided")

        and("state object for <stateId> exists in the session store")

        when("I make a GET request to the proxy's callback endpoint with a valid 'state' and {query}",
            'code=invalid-code')

        then("the response status should be {status}", 401)
      })

      describe('with a valid code', () => {
        given("cookie with <stateId> is provided")

        and("state object for <stateId> exists in the session store")

        when("I make a GET request to the proxy's callback endpoint with a valid 'code' and 'state'")

        then("the proxy should redirect me to <originalUri>", ({ resp }) => {
          assert(resp.headers.location!.endsWith(originalUri))
        })

        and("session variable {varName} should be set", Session.IdToken)

        and("session variable {varName} should be set", Session.RefreshToken)

        and(`variable ${Session.AuthState} associated with <stateId> should be cleared`, async ({ nginx, proxyUrl }) => {
          assert(stateCookie, 'stateCookie should be set')
          const cookieJar = CookieJar.withCookies([{ ...stateCookie, path: '/' }], proxyUrl)

          assert(!await nginx.variables.get(Session.AuthState, { cookieJar }))
        })
      })
    })
  })


  describe('when OP returns invalid ID Token', () => {

    describe('when ID Token is signed by a different key', () => {
      given("OP unexpectedly changed its JWK key", async ({ oauthServer }) => {
        // This JWK is different, but has the same 'kid' as the current one, so it will replace it.
        const jwk = JSON.parse(FS.readFileSync(`${__dirname}/fixtures/jwk-wrong.json`, 'utf8'))
        await oauthServer!.issuer.keys.add(jwk)
      })

      and("cookie with <stateId> is provided")

      and("state object for <stateId> exists in the session store")

      when("I make a GET request to the proxy's callback endpoint with a valid 'code' and 'state'")

      then("the response status should be {status}", 401)

      and("no session variables and OAuth cookies should be set")
    })

    // TODO: add more
  })

})


async function getValidAuthCode (ctx: Mocha.Context, state: string, nonce: string) {
  const { client, oauthServerOpts: oauthOpts, oauthServerUrl: oauthUrl } = ctx
  const oauth = oauthOpts.clients[0]

  const resp = await client.get(`${oauthUrl}/authorize`, {
    searchParams: new URLSearchParams({
      response_type: 'code',
      client_id: oauth.id,
      redirect_uri: oauth.redirectUris![0],
      state,
      nonce,
    }),
  })

  assert(resp.statusCode >= 301 && resp.statusCode <= 307, 'OP should return a redirect')
  assert(resp.headers.location, 'OP should return a Location header')

  const { searchParams } = new URL(resp.headers.location)
  assert(searchParams.get('code'), 'OP should return query parameter "code"')

  return searchParams.get('code')!
}

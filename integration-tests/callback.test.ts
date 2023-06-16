import * as FS from 'node:fs'
import { URL, URLSearchParams } from 'node:url'

import assert from './support/assert'
import { useOAuthServer } from './support/hooks'
import { Cookie, CookieJar } from './support/http-client'
import { beforeEachSuite, describe, useSharedSteps } from './support/mocha'
import { hashCsrf, randomString } from './support/utils'
import commonSteps from './steps'

import { Cookie as CookieName, CSRF_TOKEN_LENGTH, Session } from '../src/constants'


describe('Callback', () => {
  const originalUri = '/index.html'

  let csrfToken: string
  let nonce: string
  let stateCookie: Cookie | undefined

  beforeEachSuite(() => {
    csrfToken = randomString(CSRF_TOKEN_LENGTH)
    nonce = randomString()
  })

  const { given, when, then, and } = useSharedSteps({
    ...commonSteps,
    "state cookie with CSRF token is provided": async ({ client, proxyUrl }) => {
      const state = `${csrfToken}:${originalUri}`

      stateCookie = client.cookies.set(CookieName.State, encodeURI(state), proxyUrl, {
        httpOnly: true,
        maxAge: 120,
        path: '/-/oidc/callback',
      })
    },
    "nonce associated with the state cookie exists in keyval": async ({ nginx, proxyUrl }) => {
      assert(stateCookie, 'stateCookie should be set')

      await nginx.variables.set(Session.Nonce, nonce, {
        // We must modify the cookie's path to make it visible for the
        // /test-hook/variables/* resources.
        cookieJar: CookieJar.withCookies([{ ...stateCookie, path: '/' }], proxyUrl),
      })
    },
    "I make a GET request to the proxy's callback endpoint with a valid 'state' and {query}": async (ctx, query: string) => {
      ctx.resp = await ctx.client.get(
        `${ctx.proxyUrl}/-/oidc/callback?state=${hashCsrf(csrfToken)}&${query}`)
    },
    "I make a GET request to the proxy's callback endpoint with a valid 'code' and 'state'": async (ctx) => {
      const code = await getValidAuthCode(ctx, csrfToken, nonce)
      ctx.resp = await ctx.client.get(
        `${ctx.proxyUrl}/-/oidc/callback?code=${code}&state=${hashCsrf(csrfToken)}`)
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

  describe('when state does not match', () => {
    given("state cookie with CSRF token is provided")

    and("nonce associated with the state cookie exists in keyval")

    when("I make a GET request to the proxy's callback endpoint with a wrong 'state'", async (ctx) => {
      ctx.resp = await ctx.client.get(`${ctx.proxyUrl}/-/oidc/callback?code=xyx&state=wrong`)
    })

    then("the response status should be {status}", 400)
  })


  describe('when state is correct', () => {

    describe('when nonce is missing in session', () => {
      given("state cookie with CSRF token is provided")

      when("I make a GET request to the proxy's callback endpoint with a valid 'code' and 'state'")

      then("the response status should be {status}", 400)
    })

    describe('when nonce does not match', () => {
      given("state cookie with CSRF token is provided")

      and("a wrong nonce is associated with the state cookie in keyval", async ({ nginx, proxyUrl }) => {
        assert(stateCookie, 'stateCookie should be set')

        await nginx.variables.set(Session.Nonce, 'wrong-nonce', {
          cookieJar: CookieJar.withCookies([{ ...stateCookie, path: '/' }], proxyUrl),
        })
      })

      when("I make a GET request to the proxy's callback endpoint with a valid 'code' and 'state'")

      then("the response status should be {status}", 400)
    })


    describe('when nonce is correct', () => {

      describe('with error=access_denied', () => {
        given("state cookie with CSRF token is provided")

        and("nonce associated with the state cookie exists in keyval")

        when("I make a GET request to the proxy's callback endpoint with a valid 'state' and {query}",
             'error=access_denied')

        then("the response status should be {status}", 403)

        and("cookie {cookieName} should be cleared", CookieName.State)
      })

      ;['server_error', 'temporarily_unavailable'].forEach(error => {
        describe(`with error=${error}`, () => {
          given("state cookie with CSRF token is provided")

          and("nonce associated with the state cookie exists in keyval")

          when("I make a GET request to the proxy's callback endpoint with a valid 'state' and {query}",
               `error=${error}`)

          then("the response status should be {status}", 502)
        })
      })

      describe('with an invalid code', () => {
        given("state cookie with CSRF token is provided")

        and("nonce associated with the state cookie exists in keyval")

        when("I make a GET request to the proxy's callback endpoint with a valid 'state' and {query}",
            'code=invalid-code')

        then("the response status should be {status}", 401)
      })

      describe('with a valid code', () => {
        given("state cookie with CSRF token is provided")

        and("nonce associated with the state cookie exists in keyval")

        when("I make a GET request to the proxy's callback endpoint with a valid 'code' and 'state'")

        then("the proxy should redirect me to <originalUri>", ({ resp }) => {
          assert(resp.headers.location!.endsWith(originalUri))
        })

        and("session variable {varName} should be set", Session.IdToken)

        and("session variable {varName} should be set", Session.RefreshToken)

        and(`variable ${Session.Nonce} associated with the state cookie should be cleared`, async ({ nginx, proxyUrl }) => {
          assert(stateCookie, 'stateCookie should be set')
          const cookieJar = CookieJar.withCookies([{ ...stateCookie, path: '/' }], proxyUrl)

          assert(!await nginx.variables.get(Session.Nonce, { cookieJar }))
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

      and("state cookie with CSRF token is provided")

      and("nonce associated with the state cookie exists in keyval")

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
      // XXX: This can be removed after https://github.com/axa-group/oauth2-mock-server/pull/241 is merged.
      scope: 'openid',
    }),
  })

  assert(resp.statusCode >= 301 && resp.statusCode <= 307, 'OP should return a redirect')
  assert(resp.headers.location, 'OP should return a Location header')

  const { searchParams } = new URL(resp.headers.location)
  assert(searchParams.get('code'), 'OP should return query parameter "code"')

  return searchParams.get('code')!
}

import * as FS from 'node:fs'
import { URL, URLSearchParams } from 'node:url'

import assert from './support/assert'
import { useOAuthServer } from './support/hooks'
import { describe, useSharedSteps } from './support/mocha'
import { hashCsrf } from './support/utils'
import commonSteps from './steps'

import { Cookie, CSRF_TOKEN_LENGTH, Session } from '../src/constants'


describe('Callback', () => {
  const code = 'abcdef'
  const csrfToken = ''.padEnd(CSRF_TOKEN_LENGTH, 'xyz')
  const csrfTokenHash = hashCsrf(csrfToken)
  const originalUri = '/index.html'
  const state = `${csrfToken}:${originalUri}`

  const { given, when, then, and } = useSharedSteps({
    ...commonSteps,
    "state cookie with a CSRF token is provided": ({ client, proxyUrl }) => {
      client.cookies.set(Cookie.State, encodeURI(state), proxyUrl, {
        httpOnly: true,
        path: '/-/oidc/callback',
      })
    },
    "I make a GET request to the proxy's callback endpoint with query: {query}": async (ctx, query: string) => {
      ctx.resp = await ctx.client.get(`${ctx.proxyUrl}/-/oidc/callback?${query}`)
    },
    "I make a GET request to the proxy's callback endpoint with a valid 'code' and 'state'": async (ctx) => {
      const code = await getValidAuthCode(ctx, csrfToken)
      ctx.resp = await ctx.client.get(`${ctx.proxyUrl}/-/oidc/callback?code=${code}&state=${csrfTokenHash}`)
    },
  })

  useOAuthServer()

  describe('with no query parameters', () => {
    when("I make a GET request to proxy {path}", '/-/oidc/callback')

    then("the response status should be {status}", 400)
  })

  describe('when state cookie is missing', () => {
    when("I make a GET request to the proxy's callback endpoint with query: {query}",
         `code=${code}&state=${csrfTokenHash}`)

    then("the response status should be {status}", 400)
  })

  describe('when state does not match', () => {
    given("state cookie with a CSRF token is provided")

    when("I make a GET request to the proxy's callback endpoint with query: {query}",
         `code=${code}&state=wrong`)

    then("the response status should be {status}", 400)
  })


  describe('when CSRF token is correct', () => {

    describe('with error=access_denied', () => {
      given("state cookie with a CSRF token is provided")

      when("I make a GET request to the proxy's callback endpoint with query: {query}",
           `error=access_denied&state=${csrfTokenHash}`)

      then("the response status should be {status}", 403)

      and("cookie {cookieName} should be cleared", Cookie.State)
    })

    ;['server_error', 'temporarily_unavailable'].forEach(error => {
      describe(`with error=${error}`, () => {
        given("state cookie with a CSRF token is provided")

        when("I make a GET request to the proxy's callback endpoint with query: {query}",
             `error=${error}&state=${csrfTokenHash}`)

        then("the response status should be {status}", 502)
      })
    })

    describe('with an invalid code', () => {
      given("state cookie with a CSRF token is provided")

      when("I make a GET request to the proxy's callback endpoint with query: {query}",
           `code=foobar&state=${csrfTokenHash}`)

      then("the response status should be {status}", 401)
    })

    describe('with a valid code', () => {
      given("state cookie with a CSRF token is provided")

      when("I make a GET request to the proxy's callback endpoint with a valid 'code' and 'state'")

      then("the proxy should redirect me to <originalUri>", ({ resp }) => {
        assert(resp.headers.location!.endsWith(originalUri))
      })

      and("session variable {varName} should be set", Session.IdToken)

      and("session variable {varName} should be set", Session.RefreshToken)
    })
  })


  describe('when OAAS returns invalid ID Token', () => {

    describe('when ID Token is signed by a different key', () => {
      given("OAAS unexpectedly changed its JWK key", async ({ oauthServer }) => {
        // This JWK is different, but has the same 'kid' as the current one, so it will replace it.
        const jwk = JSON.parse(FS.readFileSync(`${__dirname}/fixtures/jwk-wrong.json`, 'utf8'))
        await oauthServer!.issuer.keys.add(jwk)
      })

      and("state cookie with a CSRF token is provided")

      when("I make a GET request to the proxy's callback endpoint with a valid 'code' and 'state'")

      then("the response status should be {status}", 401)

      and("no session variables and OAuth cookies should be set")
    })

    // TODO: add more
  })

})


async function getValidAuthCode ({ client, oauthServerOpts: oauthOpts, oauthServerUrl: oauthUrl }: Mocha.Context, csrfToken: string) {
  const oauth = oauthOpts.clients[0]

  const resp = await client.get(`${oauthUrl}/authorize`, {
    searchParams: new URLSearchParams({
      response_type: 'code',
      client_id: oauth.id,
      redirect_uri: oauth.redirectUris![0],
      state: csrfToken,
      // XXX: This can be removed after https://github.com/axa-group/oauth2-mock-server/pull/241 is merged.
      scope: 'openid',
    }),
  })

  assert(resp.statusCode >= 301 && resp.statusCode <= 307, 'OAAS should return a redirect')
  assert(resp.headers.location, 'OAAS should return a Location header')

  const { searchParams } = new URL(resp.headers.location)
  assert(searchParams.get('code'), 'OAAS should return query parameter "code"')

  return searchParams.get('code')!
}

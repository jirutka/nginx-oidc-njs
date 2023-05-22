import { URL, URLSearchParams } from 'node:url'

import assert from './support/assert'
import { useOAuthServer } from './support/hooks'
import { before, describe, useSharedSteps } from './support/mocha'
import commonSteps from './steps'

import { Cookie, CSRF_TOKEN_LENGTH } from '../src/constants'


describe('Callback', () => {
  const code = 'abcdef'
  const csrfToken = ''.padEnd(CSRF_TOKEN_LENGTH, 'xyz')
  const originalUri = '/index.html'
  const state = `${csrfToken}:${originalUri}`

  const { given, when, then, and } = useSharedSteps({
    ...commonSteps,
    "state cookie with a CSRF token is provided": ({ client, proxyUrl }) => {
      client.cookies.set(Cookie.State, encodeURI(state), proxyUrl)
    },
    "I make a GET request to the proxy's callback endpoint with query: {query}": async (ctx, query: string) => {
      ctx.resp = await ctx.client.get(`${ctx.proxyUrl}/-/oauth/callback?${query}`)
    },
  })

  useOAuthServer()

  describe('with no query parameters', () => {
    when("I make a GET request to proxy {path}", '/-/oauth/callback')

    then("the response status should be {status}", 400)
  })

  describe('when state cookie is missing', () => {
    when("I make a GET request to the proxy's callback endpoint with query: {query}",
         `code=${code}&state=${csrfToken}`)

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
           `error=access_denied&state=${csrfToken}`)

      then("the response status should be {status}", 403)

      and("cookie {cookieName} should be cleared", Cookie.State)
    })

    ;['server_error', 'temporarily_unavailable'].forEach(error => {
      describe(`with error=${error}`, () => {
        given("state cookie with a CSRF token is provided")

        when("I make a GET request to the proxy's callback endpoint with query: {query}",
             `error=${error}&state=${csrfToken}`)

        then("the response status should be {status}", 502)
      })
    })

    describe('with an invalid code', () => {
      given("state cookie with a CSRF token is provided")

      when("I make a GET request to the proxy's callback endpoint with query: {query}",
           `code=foobar&state=${csrfToken}`)

      then("the response status should be {status}", 401)
    })

    describe('with a valid code', () => {
      let code: string
      before(async (ctx) => {
        code = await getValidAuthCode(ctx, csrfToken)
      })

      given("state cookie with a CSRF token is provided")

      when("I make a GET request to the proxy's callback endpoint with a valid 'code' and 'state'", async (ctx) => {
        ctx.resp = await ctx.client.get(`${ctx.proxyUrl}/-/oauth/callback?code=${code}&state=${csrfToken}`)
      })

      then("the proxy should redirect me to <originalUri>", ({ resp }) => {
        assert(resp.headers.location!.endsWith(originalUri))
      })

      // FIXME
    })
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
    }),
  })

  assert(resp.statusCode >= 301 && resp.statusCode <= 307, 'OAAS should return a redirect')
  assert(resp.headers.location, 'OAAS should return a Location header')

  const { searchParams } = new URL(resp.headers.location)
  assert(searchParams.get('code'), 'OAAS should return query parameter "code"')

  return searchParams.get('code')!
}

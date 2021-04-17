import assert from './support/assert'
import { useOAuthServer } from './support/hooks'
import { describe, useSharedSteps } from './support/mocha'
import commonSteps from './steps'


describe('Logout', () => {
  const cookiePath = '/'
  const nextUri = encodeURI('/some/path.html')

  const { given, when, then } = useSharedSteps(commonSteps)

  useOAuthServer()

  describe('using GET method', () => {
    given("I'm logged in and all cookies are set")

    when("I make a GET request to proxy {path}", '/-/oauth/logout')

    then("the response status should be {status}", 405)
  })

  describe('using POST method', () => {

    describe('with nextUri', () => {
      given("I'm logged in and all cookies are set")

      when("I make a POST request to the proxy's logout endpoint with query <nextUri>", async (ctx) => {
        ctx.resp = await ctx.client.post(`${ctx.proxyUrl}/-/oauth/logout?nextUri=${nextUri}`)
      })

      then("the proxy should redirect me to <nextUri>", async ({ resp }) => {
        assert(resp.statusCode === 303)
        assert(resp.headers.location!.endsWith(nextUri))
      })

      when("I follow the redirect")

      then("no OAuth cookies should be set")
    })

    describe('without nextUri', () => {
      given("I'm logged in and all cookies are set")

      when("I make a POST request to proxy {path}", '/-/oauth/logout')

      then("the proxy should redirect me to <conf.cookiePath>", async ({ resp }) => {
        assert(resp.statusCode === 303)
        assert(resp.headers.location!.endsWith(cookiePath))
      })

      when("I follow the redirect")

      then("no OAuth cookies should be set")
    })
  })
})

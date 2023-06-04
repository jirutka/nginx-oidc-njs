import assert from './support/assert'
import { useOAuthServer } from './support/hooks'
import { describe, useSharedSteps } from './support/mocha'
import * as oauth from './support/oauth-server'
import { hashCsrf } from './support/utils'
import commonSteps from './steps'

import { Cookie as CookieName, Session } from '../src/constants'


// Note: This tests also the callback handler.

describe('Login', () => {
  const originalUri = encodeURI('/some/path.html')
  let csrfToken: string

  const { given, when, then, and } = useSharedSteps({
    ...commonSteps,
    "the proxy should redirect me to $oauth_server_url/authorize": ({ resp, oauthServerUrl }) => {
      assert(resp.statusCode === 303)
      assert(resp.headers.location!.split('?')[0] === `${oauthServerUrl}/authorize`)
    },
    "OAAS should redirect me to the $oauth_redirect_uri": ({ resp, proxyUrl }) => {
      assert(resp.headers.location!.split('?')[0] === `${proxyUrl}/-/oauth/callback`)
    },
  })


  describe('using GET method', () => {
    useOAuthServer()

    given("I'm not logged in (no session and cookies exist)")

    when("I make a GET request to proxy {path}", '/-/oauth/login')

    then("the response status should be {status}", 405)

    and("no session variables and OAuth cookies should be set")
  })

  describe('using POST method', () => {

    describe('allow authorization', () => {
      useOAuthServer()

      given("I'm not logged in (no session and cookies exist)")

      when("I make a POST request to the proxy's login endpoint with query <originalUri>", async (ctx) => {
        ctx.resp = await ctx.client.post(`${ctx.proxyUrl}/-/oauth/login?original_uri=${originalUri}`)
      })

      then("the proxy should redirect me to $oauth_server_url/authorize")

      and(`should set ${CookieName.State} cookie with <csrfToken> and <originalUri>`, (ctx) => {
        const { client: { cookies } } = ctx

        assert.includes(cookies.get(CookieName.State), {
          path: '/-/oauth/callback',
          maxAge: 120,
          httpOnly: true,
          secure: true,
        })
        const cookie = cookies.get(CookieName.State)!

        assert(cookie.value.split(':', 2)[1] === originalUri)
        assert((csrfToken = cookie.value.split(':', 2)[0]))
      })

      when("I follow the redirect")

      then("OAAS should redirect me to the $oauth_redirect_uri")

      and("the URL should contain parameter 'state' with hashed <csrfToken> and parameter 'code'", ({ resp }) => {
        assert.includes(resp.headers.location, `state=${hashCsrf(csrfToken)}`)
        assert.includes(resp.headers.location, 'code=')
      })

      when("I follow the redirect")

      then("the proxy should redirect me to <originalUri>", ({ resp }) => {
        assert(resp.headers.location!.endsWith(originalUri))
      })

      and(`set cookie ${CookieName.SessionId}`, ({ client: { cookies }, ngxOAuthConfig }) => {
        assert.includes(cookies.get(CookieName.SessionId), {
          path: ngxOAuthConfig.cookiePath,
          maxAge: ngxOAuthConfig.cookieMaxAge,
          httpOnly: true,
          secure: true,
        })
      })

      and(`set cookie ${CookieName.Username}`, ({ client: { cookies }, ngxOAuthConfig }) => {
        assert.includes(cookies.get(CookieName.Username), {
          path: ngxOAuthConfig.cookiePath,
          maxAge: ngxOAuthConfig.cookieMaxAge,
          httpOnly: undefined,
          secure: true,
          value: oauth.userId,
        })
      })

      and("session variable {varName} should be set", Session.AccessToken)

      and("session variable {varName} should be set", Session.IdToken)

      and("session variable {varName} should be set", Session.RefreshToken)
    })


    describe('deny authorization', () => {
      useOAuthServer({
        approveAuthorizationRequests: false,
      })

      given("I'm not logged in (no session and cookies exist)")

      when("I make a POST request to proxy {path}", '/-/oauth/login')

      then("the proxy should redirect me to $oauth_server_url/authorize")

      when("I follow the redirect [login and deny the authorization request]", async (ctx) => {
        ctx.resp = await ctx.client.get(ctx.resp.headers.location!)
      })

      then("OAAS should redirect me to the $oauth_redirect_uri")

      and("the URL should contain parameter 'error=access_denied'", ({ resp }) => {
        assert.includes(resp.headers.location, 'error=access_denied')
      })

      when("I follow the redirect")

      then("the response status should be {status}", 403)

      and("no session variables and OAuth cookies should be set")
    })
  })
})

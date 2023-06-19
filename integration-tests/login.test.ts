import { URL } from 'node:url'

import assert from './support/assert'
import { useOAuthServer } from './support/hooks'
import { Cookie, CookieJar } from './support/http-client'
import { describe, useSharedSteps } from './support/mocha'
import * as oauth from './support/oauth-server'
import { sha256 } from './support/utils'
import commonSteps from './steps'

import { Cookie as CookieName, Session } from '../src/constants'
import type { AuthState } from '../src/oauth'


// Note: This tests also the callback handler.

describe('Login', () => {
  const originalUri = encodeURI('/some/path.html')

  const { given, when, then, and } = useSharedSteps({
    ...commonSteps,
    "the proxy should redirect me to $oidc_server_url/authorize": ({ resp, oauthServerUrl }) => {
      assert(resp.statusCode === 303)
      assert(resp.headers.location!.split('?')[0] === `${oauthServerUrl}/authorize`)
    },
    "OP should redirect me to the $oidc_redirect_uri": ({ resp, proxyUrl }) => {
      assert(resp.headers.location!.split('?')[0] === `${proxyUrl}/-/oidc/callback`)
    },
  })


  describe('using GET method', () => {
    useOAuthServer()

    given("I'm not logged in (no session and cookies exist)")

    when("I make a GET request to proxy {path}", '/-/oidc/login')

    then("the response status should be {status}", 405)

    and("no session variables and OAuth cookies should be set")
  })

  describe('using POST method', () => {

    describe('allow authorization', () => {
      let nonce: string
      let stateCookie: Cookie

      useOAuthServer()

      given("I'm not logged in (no session and cookies exist)")

      when("I make a POST request to the proxy's login endpoint with query <originalUri>", async (ctx) => {
        ctx.resp = await ctx.client.post(`${ctx.proxyUrl}/-/oidc/login?original_uri=${originalUri}`)
      })

      then("the proxy should redirect me to $oidc_server_url/authorize")

      and(`should set ${CookieName.StateId} cookie with generated <stateId>`, (ctx) => {
        const { client: { cookies }, nginxOidcConfig } = ctx

        assert.includes(cookies.get(CookieName.StateId), {
          ...nginxOidcConfig.cookieAttrs,
          path: '/-/oidc/callback',
          maxAge: 120,
          httpOnly: true,
          sameSite: 'none',
        })
        stateCookie = cookies.get(CookieName.StateId)!
      })

      and(`the URL should contain hashed <stateId> and generated <nonce>`, ({ resp }) => {
        const locationUrl = new URL(resp.headers.location!)
        assert(locationUrl.searchParams.get('state') === sha256(stateCookie.value))
        assert((nonce = locationUrl.searchParams.get('nonce')!))
      })

      and(`should add <nonce> and <originalUri> to the session store identified by <stateId>`, async (ctx) => {
        const authState = await ctx.nginx.variables.get(Session.AuthState, {
          // We must modify the cookie's path to make it visible for the
          // /test-hook/variables/* resources.
          cookieJar: CookieJar.withCookies([{ ...stateCookie, path: '/' }], ctx.proxyUrl),
        })
        assert(authState)

        const storedState = JSON.parse(authState) as AuthState
        assert(storedState.nonce === nonce,
          'nonce stored in session and in authorization redirect must be the same')
        assert(storedState.url === originalUri)
      })

      when("I follow the redirect")

      then("OP should redirect me to the $oidc_redirect_uri")

      and("the URL should contain hashed <stateId> and parameter 'code'", ({ resp }) => {
        assert.includes(resp.headers.location, `state=${sha256(stateCookie.value)}`)
        assert.includes(resp.headers.location, 'code=')
      })

      when("I follow the redirect")

      then("the proxy should redirect me to <originalUri>", ({ resp }) => {
        assert(resp.headers.location!.endsWith(originalUri))
      })

      and(`set cookie ${CookieName.SessionId}`, ({ client: { cookies }, nginxOidcConfig }) => {
        assert.includes(cookies.get(CookieName.SessionId), {
          ...nginxOidcConfig.cookieAttrs,
          httpOnly: true,
        })
      })

      and(`set cookie ${CookieName.Username}`, ({ client: { cookies }, nginxOidcConfig }) => {
        assert.includes(cookies.get(CookieName.Username), {
          ...nginxOidcConfig.cookieAttrs,
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

      when("I make a POST request to proxy {path}", '/-/oidc/login')

      then("the proxy should redirect me to $oidc_server_url/authorize")

      when("I follow the redirect [login and deny the authorization request]", async (ctx) => {
        ctx.resp = await ctx.client.get(ctx.resp.headers.location!)
      })

      then("OP should redirect me to the $oidc_redirect_uri")

      and("the URL should contain parameter 'error=access_denied'", ({ resp }) => {
        assert.includes(resp.headers.location, 'error=access_denied')
      })

      when("I follow the redirect")

      then("the response status should be {status}", 403)

      and("no session variables and OAuth cookies should be set")
    })
  })
})

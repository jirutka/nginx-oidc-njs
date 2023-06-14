import { URL } from 'node:url'

import assert from './support/assert'
import { useOAuthServer } from './support/hooks'
import { Cookie, CookieJar } from './support/http-client'
import { describe, useSharedSteps } from './support/mocha'
import * as oauth from './support/oauth-server'
import { hashCsrf } from './support/utils'
import commonSteps from './steps'

import { Cookie as CookieName, Session } from '../src/constants'


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
      let csrfToken: string
      let nonce: string
      let stateCookie: Cookie

      useOAuthServer()

      given("I'm not logged in (no session and cookies exist)")

      when("I make a POST request to the proxy's login endpoint with query <originalUri>", async (ctx) => {
        ctx.resp = await ctx.client.post(`${ctx.proxyUrl}/-/oidc/login?original_uri=${originalUri}`)
      })

      then("the proxy should redirect me to $oidc_server_url/authorize")

      and(`should set ${CookieName.State} cookie with <csrfToken> and <originalUri>`, (ctx) => {
        const { client: { cookies }, nginxOidcConfig } = ctx

        assert.includes(cookies.get(CookieName.State), {
          ...nginxOidcConfig.cookieAttrs,
          path: '/-/oidc/callback',
          maxAge: 120,
          httpOnly: true,
          sameSite: 'none',
        })
        stateCookie = cookies.get(CookieName.State)!

        assert(stateCookie.value.split(':', 2)[1] === originalUri)
        assert((csrfToken = stateCookie.value.split(':', 2)[0]))
      })

      and("the URL should contain 'state' with hashed <csrfToken> and a 'nonce'", ({ resp }) => {
        const locationUrl = new URL(resp.headers.location!)
        assert(locationUrl.searchParams.get('state') === hashCsrf(csrfToken))
        assert((nonce = locationUrl.searchParams.get('nonce')!))
      })

      and(`the nonce should be stored in keyval by the ${CookieName.State} cookie`, async ({ nginx, proxyUrl }) => {
        const storedNonce = await nginx.variables.get(Session.Nonce, {
          // We must modify the cookie's path to make it visible for the
          // /test-hook/variables/* resources.
          cookieJar: CookieJar.withCookies([{ ...stateCookie, path: '/' }], proxyUrl),
        })
        assert(storedNonce === nonce,
          'nonce stored in keyval and in authorization redirect must be the same')
      })

      when("I follow the redirect")

      then("OP should redirect me to the $oidc_redirect_uri")

      and("the URL should contain parameter 'state' with hashed <csrfToken> and parameter 'code'", ({ resp }) => {
        assert.includes(resp.headers.location, `state=${hashCsrf(csrfToken)}`)
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

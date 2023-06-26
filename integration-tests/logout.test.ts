import assert from './support/assert'
import { patchNginxConfig, useOAuthServer } from './support/hooks'
import { describe, useSharedSteps } from './support/mocha'
import sharedSteps from './steps'

import { Cookie as CookieName, Session } from '../src/constants'


describe('Logout', () => {
  const { and, given, when, then } = useSharedSteps(sharedSteps)

  useOAuthServer()

  describe('using GET method', () => {
    given("I'm logged in (session and cookies are set)")

    when("I make a GET request to proxy {path}", '/-/oidc/logout')

    then("the response status should be {status}", 405)
  })


  describe('using POST method', () => {

    describe('without conf.endSessionEndpoint', () => {

      describe('without conf.postLogoutRedirectUri and ?nextUri=', () => {

        describe("without 'text/html' in Accept header", () => {
          given("I'm logged in (session and cookies are set)")

          when("I make a POST request to proxy /-/oidc/logout with header Accept: application/json", async (ctx) => {
            ctx.resp = await ctx.client.post(`${ctx.proxyUrl}/-/oidc/logout`, {
              headers: { Accept: 'application/json' },
            })
          }),

          then("the response status should be {status}", 204)

          and("cookie {cookieName} should be cleared", CookieName.SessionId)

          and("cookie {cookieName} should be cleared", CookieName.Username)

          and("no session variables should be set")
        })

        describe("with 'text/html' in Accept header", () => {
          const acceptHeader = 'text/plain, text/html;q=0.9, */*;q=0.8'

          given("I'm logged in (session and cookies are set)")

          when(`I make a POST request to proxy /-/oidc/logout with header Accept: "${acceptHeader}"`, async (ctx) => {
            ctx.resp = await ctx.client.post(`${ctx.proxyUrl}/-/oidc/logout`, {
              headers: { Accept: acceptHeader },
            })
          }),

          then("the proxy should return 200 and an HTML page with text 'Logged out'", async ({ resp }) => {
            assert(resp.statusCode === 200)
            assert(resp.headers['content-type'] === 'text/html')
            assert.includes(resp.body, '<h1>Logged out</h1>')
          })

          and("cookie {cookieName} should be cleared", CookieName.SessionId)

          and("cookie {cookieName} should be cleared", CookieName.Username)

          and("no session variables should be set")
        })
      })


      describe('with ?nextUri=', () => {
        const nextUri = encodeURI('/some/path.html')

        given("I'm logged in (session and cookies are set)")

        when("I make a POST request to the proxy's logout endpoint with query <nextUri>", async (ctx) => {
          ctx.resp = await ctx.client.post(`${ctx.proxyUrl}/-/oidc/logout?nextUri=${nextUri}`)
        })

        then("the proxy should redirect me to <nextUri>", async ({ resp }) => {
          assert(resp.statusCode === 303)
          assert(resp.headers.location!.endsWith(nextUri))
        })

        when("I follow the redirect")

        then("no session variables and OAuth cookies should be set")
      })


      describe('with conf.postLogoutRedirectUri', () => {
        const postLogoutRedirectUri = '/post-logout'

        patchNginxConfig([
          { path: '/http/server/set', op: 'add', value: `$oidc_post_logout_redirect_uri "${postLogoutRedirectUri}"` },
        ])

        given("I'm logged in (session and cookies are set)")

        when("I make a POST request to proxy {path}", '/-/oidc/logout')

        then("the proxy should redirect me to <conf.postLogoutRedirectUri>", async ({ resp }) => {
          assert(resp.statusCode === 303)
          assert(resp.headers.location!.endsWith(postLogoutRedirectUri))
        })

        when("I follow the redirect")

        then("no session variables and OAuth cookies should be set")
      })
    })


    // OpenID Connect RP-Initiated Logout 1.0
    describe('with conf.endSessionEndpoint', () => {
      const endSessionEndpoint = 'https://op.example.org/endsession'
      const postLogoutRedirectUri = 'https://rp.example.org/post-logout'
      let idToken: string
      let locationParams: URLSearchParams

      function includeCommonSteps () {
        given("I'm logged in (session and cookies are set)")

        and('(store <idToken>)', async ({ nginx }) => {
          idToken = (await nginx.variables.get(Session.IdToken))!
        })

        when("I make a POST request to proxy {path}", '/-/oidc/logout')

        then("the proxy should redirect me to <conf.endSessionEndpoint>", async ({ resp }) => {
          assert(resp.statusCode === 303)
          assert(resp.headers.location!.startsWith(endSessionEndpoint))
          locationParams = new URL(resp.headers.location!).searchParams
        })

        and("cookie {cookieName} should be cleared", CookieName.SessionId)

        and("cookie {cookieName} should be cleared", CookieName.Username)

        and("no session variables should be set")

        and('the redirect should contain ?client_id=<conf.clientId>', ({ nginxOidcConfig }) => {
          assert(locationParams.get('client_id') === nginxOidcConfig.clientId)
        })

        and('the redirect should contain ?id_token_hint=<idToken>', () => {
          assert(locationParams.get('id_token_hint') === idToken)
        })
      }

      describe('without conf.postLogoutRedirectUri and ?nextUri=', () => {
        patchNginxConfig([
          { path: '/http/server/set', op: 'add', value: `$oidc_end_session_endpoint "${endSessionEndpoint}"` },
        ])

        includeCommonSteps()

        and('the redirect should NOT contain ?post_logout_redirect_uri', () => {
          assert(!locationParams.has('post_logout_redirect_uri'))
        })
      })

      describe('with conf.postLogoutRedirectUri', () => {
        patchNginxConfig([
          { path: '/http/server/set', op: 'add', value: `$oidc_end_session_endpoint "${endSessionEndpoint}"` },
          { path: '/http/server/set', op: 'add', value: `$oidc_post_logout_redirect_uri "${postLogoutRedirectUri}"` },
        ])

        includeCommonSteps()

        and('the redirect should contain ?post_logout_redirect_uri=<conf.postLogoutRedirectUri>', () => {
          assert(locationParams.get('post_logout_redirect_uri') === postLogoutRedirectUri)
        })
      })
    })
  })
})

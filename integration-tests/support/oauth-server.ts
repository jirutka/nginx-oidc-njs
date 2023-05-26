import http from 'node:http'

import Router from '@koa/router'
import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import LogLevel from 'loglevel'
import OAuth2Server, {
  AccessDeniedError,
  OAuthError, Request as OAuthRequest,
  Response as OAuthResponse,
} from 'oauth2-server'
import type {
  AuthorizationCode,
  AuthorizationCodeModel,
  AuthorizeOptions,
  Client as BaseClient,
  RefreshToken,
  RefreshTokenModel,
  Token,
  TokenOptions,
  User,
} from 'oauth2-server'
import { v4 as uuid } from 'uuid'

import { asyncServer, AsyncServer } from './async-server'
import { removeBy } from './utils'

import type { IntrospectionResponse } from '../../src/oauth'


export interface OAuthOptions extends AuthorizeOptions, TokenOptions {
  approveAuthorizationRequests?: boolean
  clients: OAuthClient[]
  newAccessTokens?: string[]  // TODO: remove?
  newRefreshTokens?: string[]  // TODO: remove?
  userId?: string
}

export interface OAuthClient extends BaseClient {
  secret: string
  scopes: string[]
}

interface AppContext extends Koa.Context {
  oauthServer: OAuth2Server
  oauthModel: AuthorizationCodeModel & RefreshTokenModel
  opts: OAuthOptions
}


const log = LogLevel.getLogger('oauth-server')

const createModel = (opts: OAuthOptions): AuthorizationCodeModel & RefreshTokenModel => {
  const tokens: Token[] = []
  const authorizationCodes: AuthorizationCode[] = []
  const clients = opts.clients
  const newAccessTokens = [...opts.newAccessTokens ?? []]
  const newRefreshTokens = [...opts.newRefreshTokens ?? []]

  return {
    async saveToken (token, client, user) {
      //console.warn(`saveToken: ${JSON.stringify(token)}`)
      log.debug
      token = { ...token, client, user }
      tokens.push(token)
      return token
    },
    async getAccessToken (accessToken) {
      //console.warn(`getAccessToken: ${accessToken}`)
      return tokens.find(token => token.accessToken === accessToken)
    },
    async getRefreshToken (refreshToken) {
      return tokens.find(token => token.refreshToken === refreshToken) as RefreshToken | undefined
    },
    async revokeToken (token) {
      return removeBy(tokens, it => {
        return it.accessToken === token.accessToken
            || it.refreshToken != null && it.refreshToken === token.refreshToken
      }) > 0
    },
    async saveAuthorizationCode (code, client, user) {
      if (opts.approveAuthorizationRequests === false) {
        throw new AccessDeniedError('Access denied: user denied access to application')
      }

      //console.warn(`saveAuthorizationCode: ${code.authorizationCode}`)
      const authCode: AuthorizationCode = { ...code, client, user }
      authorizationCodes.push(authCode)

      return authCode
    },
    async getAuthorizationCode (authorizationCode) {
      //console.warn(`getAuthorizationCode: ${authorizationCode}`)
      return authorizationCodes.find(code => code.authorizationCode === authorizationCode)
    },
    async revokeAuthorizationCode (code) {
      return removeBy(authorizationCodes, it => it.authorizationCode === code.authorizationCode) > 0
    },
    async getClient (clientId, clientSecret) {
      //console.warn(`getClient: ${clientId}, ${clientSecret}`)
      return clients.find(entry => entry.id === clientId && clientSecret === null || entry.secret === clientSecret)
    },
    async verifyScope (_token, _scope) {
      //console.warn(`verifyScope: ${_token.accessToken} ${_scope}`)
      return true
    },
    async generateAccessToken (_client, _user, _scope) {
      return newAccessTokens.pop() ?? Promise.resolve(uuid())
    },
    async generateRefreshToken (_client, _user, _scope) {
      return newRefreshTokens.pop() ?? Promise.resolve(uuid())
    },
  }
}

const router = new Router<void, AppContext>()
  .get('/', ctx => {
    ctx.status = 200
  })
  .get('/oauth/authorize', async ctx => {
    //console.warn('authorize...')
    const request = new OAuthRequest(ctx.request)
    const response = new OAuthResponse(ctx.response)

    try {
      await ctx.oauthServer.authorize(request, response, {
        authenticateHandler: {
          handle: (): User => ({ id: ctx.opts.userId || 'flynn' }),
        },
      })
    } catch (err) {
      if (!(err instanceof OAuthError)) {
        throw err
      }
    }

    ctx.set(response.headers!)
    ctx.body = response.body
    ctx.status = response.status!
  })
  .post('/oauth/token', async ctx => {
    const request = new OAuthRequest(ctx.request)
    const response = new OAuthResponse(ctx.response)

    try {
      await ctx.oauthServer.token(request, response)
    } catch (err) {
      if (!(err instanceof OAuthError)) {
        throw err
      }
    }

    ctx.set(response.headers!)
    ctx.body = response.body
    ctx.status = response.status!
  })
  .post('/oauth/introspect', async ctx => {
    // TODO: Require Authorization.
    const token = (ctx.request.body as any)?.token

    if (!token) {
      ctx.throw("Required form parameter 'token' is missing", 400)
    }
    const accessToken = await ctx.oauthModel.getAccessToken(token as string)

    if (accessToken) {
      const { scope } = accessToken
      const body: IntrospectionResponse = {
        active: true,
        client_id: accessToken.client.id,
        scope: typeof scope === 'string' ? scope : scope?.join(',')!,
        exp: accessToken.accessTokenExpiresAt!.getTime(),
        username: accessToken.user.id,
      }
      ctx.body = body
    } else {
      const body: Partial<IntrospectionResponse> = { active: false }
      ctx.body = body
    }
    ctx.status = 200
  })


function createApp (opts: OAuthOptions) {
  const app = new Koa()
    .use(bodyParser())
    .use(router.routes())
    .use(router.allowedMethods())

  app.context.oauthModel = createModel(opts)
  app.context.oauthServer = new OAuth2Server({
    ...opts,
    model: app.context.oauthModel
  })
  app.context.opts = opts

  return app
}

export function createServer (config: OAuthOptions): AsyncServer {
  return asyncServer(http.createServer(createApp(config).callback()))
}

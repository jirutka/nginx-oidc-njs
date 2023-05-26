import http from 'node:http'
import { URL } from 'node:url'

import Router from '@koa/router'
import createError from 'http-errors'
import Koa, { Middleware, Next } from 'koa'
import LogLevel from 'loglevel'

import { asyncServer, AsyncServer } from './async-server'
import { createClient } from './http-client'

import type { IntrospectionResponse } from '../../src/oauth'


export interface RPOptions {
  introspectionUrl: string
  clientId: string
  clientSecret: string
}

interface AppContext extends Koa.Context {
  opts: RPOptions
}

const log = LogLevel.getLogger('resource-provider')

const oauthAuthenticator = (opts: RPOptions): Middleware<{}, AppContext> => {
  const url = new URL(opts.introspectionUrl)
  const realm = url == null ? '' : `${url.protocol}//${url.host}`
  const client = createClient()

  return async (ctx: AppContext, next: Next): Promise<void> => {
    const token = getBearerToken(ctx)
    if (!token) {
      ctx.set('WWW-Authenticate', `Bearer realm=${realm}, error=invalid_request`)
      throw createError(401, 'Unauthenticated')
    }

    log.debug(`Verifying token: ${token}`)
    const resp = await client.post(opts.introspectionUrl, {
      form: { token },
      responseType: 'json',
      throwHttpErrors: false,
      username: opts.clientId,
      password: opts.clientSecret,
    })
    const data = resp.body as IntrospectionResponse

    if (!data.active) {
      ctx.set('WWW-Authenticate', `Bearer realm=${realm}, error=invalid_token`)
      throw createError(401, 'Invalid access token')
    }
    if (resp.statusCode !== 200 || !('client_id' in data)) {
      throw createError(503, 'Unable to verify access token')
    }

    log.debug('Client provided a valid token')
    await next()
  }
}

async function errorMiddleware (ctx: AppContext, next: Next): Promise<any> {
  try {
    await next()
  } catch (err: any) {
    log.warn(err)

    // Tell Koa's onerror handler to not log this error.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    err.expose = true

    ctx.app.emit('error', err, ctx)
  }
}

function getBearerToken (ctx: AppContext): string | undefined {
  // Parse access token from the Authorization header
  const authorization = ctx.get('authorization')
  if (authorization?.startsWith('Bearer ')) {
    return authorization.split(' ', 2)[1]
  }
  return
}

function createApp (opts: RPOptions) {
  const router = new Router<void, {}>()
    .get('/', ctx => {
      ctx.status = 204
    })
    .get('/secured/ping', oauthAuthenticator(opts), async ctx => {
      ctx.body = 'pong'
      ctx.status = 200
    })

  const app = new Koa()
    .use(errorMiddleware)
    .use(router.routes())
    .use(router.allowedMethods())

  app.context.opts = opts

  return app
}

export function createServer (opts: RPOptions): AsyncServer {
  return asyncServer(http.createServer(createApp(opts).callback()))
}

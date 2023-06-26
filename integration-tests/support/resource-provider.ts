import http from 'node:http'
import { URL } from 'node:url'

import express, { NextFunction, Request, Response } from 'express'
import createError from 'http-errors'
import LogLevel from 'loglevel'

import { asyncServer, AsyncServer } from './async-server'
import { createClient } from './http-client'
import { splitWithLimit } from './utils'

import type { IntrospectionResponse } from '../../src/oauth'


export interface RPOptions {
  introspectionUrl: string
  clientId: string
  clientSecret: string
}

const log = LogLevel.getLogger('resource-provider')

const oauthAuthenticator = (opts: RPOptions) => {
  const url = new URL(opts.introspectionUrl)
  const realm = url == null ? '' : `${url.protocol}//${url.host}`
  const client = createClient()

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = getBearerToken(req)
      if (!token) {
        res.setHeader('WWW-Authenticate', `Bearer realm=${realm}, error=invalid_request`)
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
        res.setHeader('WWW-Authenticate', `Bearer realm=${realm}, error=invalid_token`)
        throw createError(401, 'Invalid access token')
      }
      if (resp.statusCode !== 200 || !('client_id' in data)) {
        throw createError(503, 'Unable to verify access token')
      }

      log.debug('Client provided a valid token')
      next()

    } catch (err) {
      next(err)
    }
  }
}

function errorHandler (err: any, _req: Request, res: Response, next: NextFunction) {
  log.warn(err)

  if (res.headersSent) {
    return next(err)
  }
  const status = err.statusCode ?? 500
  const message = err.message ?? 'Server Error'

  res.status(status).json({
    status,
    message,
  })
}

function getBearerToken (req: Request): string | undefined {
  // Parse access token from the Authorization header
  const authorization = req.get('authorization')
  if (authorization?.startsWith('Bearer ')) {
    return splitWithLimit(authorization, ' ', 2)[1]
  }
  return
}

function createApp (opts: RPOptions) {
  const app = express()
    .use(express.json())
    .get('/', (_req, res) => {
      res.sendStatus(204)
    })
    .get('/secured/ping', oauthAuthenticator(opts), (_req, res) => {
      res.send('pong')
    })
    .use(errorHandler)

  return app
}

export function createServer (opts: RPOptions): AsyncServer {
  return asyncServer(http.createServer(createApp(opts)))
}

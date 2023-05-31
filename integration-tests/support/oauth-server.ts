import { urlencoded } from 'body-parser'
import type { Request } from 'express'
import { Events, JWK, MutableRedirectUri, MutableResponse, OAuth2Server, Payload } from 'oauth2-mock-server'

import assert from './assert'
import { parseBasicAuthHeader } from './utils'


export type { OAuth2Server }

export interface OAuthOptions {
  approveAuthorizationRequests?: boolean
  clients: OAuthClient[]
  jwks: JWKS
}

export interface JWKS {
  keys: JWK[]
}

interface OAuthClient {
  id: string
  redirectUris?: string[] | undefined
  grants: string[]
  secret: string
  scopes: string[]
  [key: string]: unknown
}

interface State {
  issuedTokens: StoredToken[]
  // { [<code>]: <client_id> }
  authzCodes: Record<string, string>
}

interface StoredToken {
  token_type: 'Bearer'
  access_token: string
  refresh_token?: string
  id_token?: string
  expires_in: number
  scope: string

  exp: number
  username?: string
  client_id: string
}

interface IntrospectionResponse {
  active: boolean
  scope: string
  client_id: string
  username?: string
  exp: number
}

// Must be the same as in oauth2-mock-server.
export const accessTokenLifetime = 3600
export const userId = 'johndoe'

export async function createOAuthServer (opts: OAuthOptions): Promise<OAuth2Server> {
  const server = new OAuth2Server()

  // Prepend urlencoded middleware needed for the introspect endpoint.
  const { requestHandler  } = server.service
  requestHandler.use(urlencoded({ extended: false }))
  requestHandler._router.stack.unshift(requestHandler._router.stack.pop())

  const state: State = {
    issuedTokens: [],
    authzCodes: {},
  }

  server.service
    .on(Events.BeforeAuthorizeRedirect, AuthorizeRedirectListener(opts, state))
    .on(Events.BeforeResponse, TokenResponseListener(opts, state))
    .on(Events.BeforeIntrospect, IntrospectListener(opts, state))

  for (const jwk of opts.jwks.keys) {
    await server.issuer.keys.add(jwk)
  }

  return server
}

// Listener for the authorization endpoint.
const AuthorizeRedirectListener = (opts: OAuthOptions, state: State) => (
  redirectUri: MutableRedirectUri,
  req: Request,
) => {
  const { searchParams } = redirectUri.url
  const { client_id } = req.query

  const sendError = (code: string, desc: string) => {
    searchParams.delete('code')
    searchParams.delete('scope')
    searchParams.set('error', code)
    searchParams.set('error_description', desc)
  }

  if (typeof client_id !== 'string') {
    return sendError('invalid_request', 'Missing client_id.')
  }
  if (!opts.clients.some(o => o.id === client_id)) {
    return sendError('unauthorized_client', 'Unknown client_id.')
  }
  if (opts.approveAuthorizationRequests === false) {
    return sendError('access_denied', 'The resource owner denied the request.')
  }

  if (!searchParams.has('error')) {
    const code = searchParams.get('code')
    assert(typeof code === 'string')

    state.authzCodes[code] = client_id
  }
}

// Listener for the token endpoint.
const TokenResponseListener = (opts: OAuthOptions, state: State) => (
  res: MutableResponse,
  req: Request,
) => {
  const sendError = (status: number, code: string, desc: string) => {
    res.statusCode = status
    res.body = {
      error: code,
      error_description: desc,
    }
  }

  const auth = parseBasicAuthHeader(req.headers.authorization ?? '')
  if (!auth) {
    return sendError(401, 'invalid_client', 'Missing Authorization header.')
  }

  const client = opts.clients.find(o => o.id === auth.username && o.secret === auth.password)
  if (!client) {
    return sendError(401, 'invalid_client', 'Wrong client_id or client_secret.')
  }

  const { code, grant_type } = req.body
  if (!client.grants.includes(grant_type)) {
    return sendError(400, 'unauthorized_client',
      `Grant type ${grant_type} is not allowed for this client.`)
  }
  switch (grant_type) {
    case 'authorization_code': {
      if (typeof code !== 'string') {
        return sendError(400, 'invalid_request', 'Missing code parameter.')
      }
      if (state.authzCodes[code] !== auth.username) {
        return sendError(400, 'invalid_grant', 'Invalid authorization code.')
      }
      break
    }
    case 'refresh_token': {
      const { refresh_token } = req.body
      if (typeof refresh_token !== 'string') {
        return sendError(400, 'invalid_request', 'Missing refresh_token parameter.')
      }
      if (!state.issuedTokens.some(o => o.refresh_token === refresh_token)) {
        return sendError(400, 'invalid_grant', 'Invalid refresh token.')
      }
    }
    break
  }

  if (res.statusCode === 200 && typeof res.body === 'object') {
    const id_token = res.body.id_token as string
    const expires_in = res.body.expires_in as number

    const username = id_token && decodeJwtPayload(id_token).sub as string | undefined

    state.issuedTokens.push({
      ...res.body as any,
      exp: timestamp() + expires_in,
      client_id: auth.username,
      username,
    })
    if (code) {
      delete state.authzCodes[code]
    }
  }
}

// Listener for the introspect endpoint.
const IntrospectListener = (opts: OAuthOptions, state: State) => (
  res: MutableResponse,
  req: Request
) => {
  const auth = parseBasicAuthHeader(req.headers.authorization ?? '')
  if (!auth) {
    res.statusCode = 401
    return
  }
  if (!opts.clients.some(o => o.id === auth.username && o.secret === auth.password)) {
    res.statusCode = 403
    return
  }

  if (req.get('Content-Type') !== 'application/x-www-form-urlencoded') {
    res.statusCode = 415
    return
  }

  const { token } = req.body
  if (typeof token !== 'string') {
    res.statusCode = 400
    return
  }

  const storedToken = state.issuedTokens
    .find(o => [o.access_token, o.refresh_token, o.id_token].includes(token))

  const body = storedToken && storedToken.exp > timestamp()
    ? createIntrospectionResponse(storedToken)
    : { active: false }

  res.statusCode = 200
  res.body = body as Record<string, unknown>
}

const createIntrospectionResponse = (token: StoredToken): IntrospectionResponse => ({
  active: true,
  exp: token.exp,
  scope: token.scope ?? '',
  client_id: token.client_id,
  username: token.username,
})

function decodeJwtPayload (jwt: string): Payload {
  const parts = jwt.split('.')
  if (parts.length !== 3) {
    throw TypeError('Invalid Compact JWS')
  }

  return JSON.parse(Buffer.from(parts[1], 'base64url').toString())
}

const timestamp = () => Math.floor(Date.now() / 1000)

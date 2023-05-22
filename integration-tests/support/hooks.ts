import * as FS from 'fs'
import { after, before, Context, RootHookObject } from 'mocha'
import { beforeEachSuite } from 'mocha-suite-hooks'
import { parseConf, startNginx, NginxServer, PatchOperation } from 'nginx-testing'
import 'anylogger-loglevel'
import LogLevel from 'loglevel'

import { AsyncServer } from './async-server'
import { createClient, HttpClient, Response } from './http-client'
import { createServer as createOAuthServer, OAuthOptions } from './oauth-server'
import { parseNgxOAuthConfig, NgxOAuthConfig } from './ngx-oauth-config'
import { createServer as createRPServer, RPOptions } from './resource-provider'


declare module 'mocha' {
  export interface Context {
    oauthServerOpts: OAuthOptions
    oauthServerUrl: string
    proxyUrl: string
    nginx: NginxServer
    ngxOAuthConfig: NgxOAuthConfig,
    client: HttpClient
    resp: Response<string>
  }
}

const nginxVersion = process.env.NGINX_VERSION || '1.22.x'
const nginxConfig = `${__dirname}/../nginx.conf`
const certificate = FS.readFileSync(`${__dirname}/../fixtures/server.crt`)

LogLevel.getLogger('nginx-binaries').setLevel('DEBUG')
LogLevel.setDefaultLevel('DEBUG')

export const mochaHooks: RootHookObject = {
  async beforeAll (this: Context) {
    this.timeout(30_000)

    const host = '127.0.0.1'
    this.nginx = await startNginx({ version: nginxVersion, bindAddress: host, configPath: nginxConfig })

    const errors = (await this.nginx.readErrorLog())
      .split('\n')
      .filter(line => line.includes('[error]'))
    if (errors) {
      console.error(errors.join('\n'))
    }

    this.ngxOAuthConfig = parseNgxOAuthConfig(this.nginx.config)
    this.proxyUrl = `https://${host}:${this.nginx.port}`

    this.client = createClient({
      followRedirect: false,
      https: {
        certificateAuthority: certificate,
      },
      retry: 0,
      throwHttpErrors: false,
    })

    beforeEachSuite(async function () {
      this.client.cookies.clear()

      // Read the logs to consume (discard) them before running next test suite
      // (describe block).
      await this.nginx.readErrorLog()
      await this.nginx.readAccessLog()
    })
  },

  async afterAll (this: Context) {
    if (this.nginx) {
      await this.nginx.stop()
    }
  },

  async afterEach (this: Context) {
    const { currentTest, nginx } = this

    if (currentTest?.state === 'failed' && currentTest.err) {
      const errorLog = await nginx.readErrorLog()
      const accessLog = await nginx.readAccessLog()

      const logs = [
        errorLog && '----- Error Log -----\n' + errorLog,
        accessLog && '----- Access Log -----\n' + accessLog,
      ].filter(Boolean)

      if (logs.length > 0) {
        currentTest.err.stack += '\n\n' + logs.join('\n\n').replace(/^/gm, '    ')
      }
    }
  }
}

export function patchNginxConfig (patch: PatchOperation[]): void {
  let oldConfig: string

  before(async function () {
    oldConfig = this.nginx.config
    const newConfig = parseConf(oldConfig).applyPatch(patch).toString()

    await this.nginx.restart({ config: newConfig })

    this.ngxOAuthConfig = parseNgxOAuthConfig(this.nginx.config)
  })

  after(async function () {
    oldConfig && await this.nginx.restart({ config: oldConfig })

    this.ngxOAuthConfig = parseNgxOAuthConfig(this.nginx.config)
  })
}

export function useOAuthServer (opts: Partial<OAuthOptions> = {}): void {
  let server: AsyncServer

  before(async function () {
    const oauthPort = this.nginx.ports[1]
    this.oauthServerUrl = `http://127.0.0.1:${oauthPort}/oauth`

    this.oauthServerOpts = {
      clients: [
        {
          id: '16fba2aa-33fc-4066-a449-3169e637dfbc',
          secret: '8ykAbAlSCzUXKFRtSZBlhe8HaKMipjhc',
          grants: ['authorization_code', 'refresh_token'],
          scopes: ['any'],
          redirectUris: [`${this.proxyUrl}/-/oauth/callback`],
        },
      ],
      accessTokenLifetime: 3600,
      refreshTokenLifetime: 720,
      ...opts,
    }

    server = await createOAuthServer(this.oauthServerOpts).listenAsync(oauthPort)
  })

  after(async () => {
    await server.forceShutdownAsync()
  })
}

export function useResourceProvider (): void {
  let server: AsyncServer

  before(async function () {
    const port = this.nginx.ports[2]

    const opts: RPOptions = {
      checkTokenUrl: `${this.oauthServerUrl}/check_token`,
    }

    server = await createRPServer(opts).listenAsync(port)
  })

  after(async () => {
    await server.forceShutdownAsync()
  })
}

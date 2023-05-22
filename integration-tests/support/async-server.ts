import type * as net from 'node:net'
import { promisify } from 'node:util'

import shutdownable from 'http-shutdown'


export interface AsyncServer extends net.Server {
  listenAsync (port?: number, hostname?: string, backlog?: number): Promise<this>
  listenAsync (port?: number, backlog?: number): Promise<this>
  listenAsync (path: string, backlog?: number): Promise<this>
  listenAsync (options: net.ListenOptions): Promise<this>
  listenAsync (handle: any, backlog?: number): Promise<this>

  closeAsync (): Promise<void>

  shutdownAsync (): Promise<void>

  forceShutdownAsync (): Promise<void>

  // From http-shutdown
  shutdown (cb: (err?: Error) => any): void
  forceShutdown (cb: (err?: Error) => any): void
}

export function asyncServer (server: net.Server): AsyncServer {
  const srv = shutdownable(server) as AsyncServer

  srv.listenAsync = function (...args: any[]): Promise<AsyncServer> {
    return new Promise<AsyncServer>((resolve, reject) => {
      this.listen(...args)
        .once('listening', () => resolve(this))
        .once('error', (err) => reject(err))
    })
  }
  srv.closeAsync = promisify(srv.close)
  srv.shutdownAsync = promisify(srv.shutdown)
  srv.forceShutdownAsync = promisify(srv.forceShutdown)

  return srv
}

import { RequestHandler } from '..'


export const client_authorization: RequestHandler = (ctx) => {
  const { conf } = ctx
  ctx.handlerType = 'variable'

  const credentials = btoa(`${conf.clientId}:${conf.clientSecret}`)

  return `Basic ${credentials}`
}

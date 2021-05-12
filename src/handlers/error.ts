import fs from 'fs'
import qs from 'querystring'

import type { RequestHandler } from '../'
import { HttpError, isHttpError } from '../context'
import { renderTemplate, preferredMediaType } from '../utils'


const supportedMediaType = ['text/html', 'application/json'] as const

const statusTexts: Record<number, string> = {
  401: 'Unauthorized',
  403: 'Forbidden',
  500: 'Internal Server Error',
}

const defaultHtmlTemplate = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{{ status }} {{ title }}</title>
  <style>
    html {
      height: 100%;
    }
    body {
      position: relative;
      top: 33%;
      transform: translateY(-33%);
      text-align: center;
      max-width: 40rem;
      margin: auto;
      font-family: mono;
    }
  </style>
</head>
<body>
  <h1>{{ status }}</h1>
  <h2>{{ title }}</h2>
  <p>{{ detail }}</p>
  <footer>
    <p>TrackID: {{ trackId }}</p>
  </footer>
</body>
</html>
`

export const error: RequestHandler = ({ conf, fail, log, req, send, vars }) => {
  const err = qs.decode(vars.args!) as any
  err.status = parseInt(err.status) || parseInt(err.code) || 500
  err.title ??= statusTexts[err.status]
  delete err.code

  if (!isHttpError(err)) {
    return fail(500, 'Invalid Error Arguments', `Given arguments: ${vars.args}.`)
  }

  const mediaType = preferredMediaType(req.headersIn['Accept'] || '', supportedMediaType)

  log.debug?.(`error: returning error ${err.status} as media type ${mediaType}`)

  const body = mediaType === 'application/json'
    ? JSON.stringify(err) + '\n'
    : renderErrorPage(err, conf.errorPagesDir)

  return send(err.status, body, {
    'Content-Type': mediaType,
    'Set-Cookie': vars.auth_cookie ? [vars.auth_cookie] : undefined,
  })
}

function renderErrorPage (error: HttpError, errorPagesDir: string): string {
  const filepath = findErrorPageTemplate(error.status, errorPagesDir)

  const template = filepath
    ? fs.readFileSync(filepath, 'utf8')
    : defaultHtmlTemplate

  return renderTemplate(template, error)
}

function findErrorPageTemplate (status: number, dirname: string): string | undefined {
  if (!dirname) return

  let files; try {
    files = fs.readdirSync(dirname, 'utf8')
  } catch (err) {
    return
  }
  const statusClass = (status / 100).toFixed()

  for (const fileName of [`${status}.html`, `${statusClass}xx.html`]) {
    if (files.includes(fileName)) {
      return `${dirname}/${fileName}`
    }
  }
  return
}

import { parseConf } from 'nginx-testing'

import { arrify } from './utils'

import { configReader, Config } from '../../src/config'


export type { Config as NgxOAuthConfig }

export function parseNgxOAuthConfig (nginxConf: string, path = '/http/server'): Config {
  const directives = arrify(parseConf(nginxConf).get(`${path}/set`))

  if (directives.length < 1) {
    throw Error(`No 'set' directives found at '${path}' in given nginx config`)
  }
  const variables = directives.reduce<Record<string, string>>((acc, item) => {
    const [key, value] = parseSetDirective(item)
    acc[key] = value
    return acc
  }, {})

  return configReader(variables)
}

function parseSetDirective (dir: string): [key: string, value: any] {
  let [key, value] = dir.split(' ', 2)

  key = key.slice(1)
  // XXX: This is very simplified.
  value = value.replace(/^\s*(["'])(.+)\1\s*$/, '$2')

  return [key, value]
}

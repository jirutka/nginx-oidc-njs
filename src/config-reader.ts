import { camelToSnake, ValuesExclude } from './utils'


type ConfigConverters<T> = {
  [K in keyof T]?: (value: string) => T[K]
}

/**
 * A function that reads configuration properties from the nginx variables.
 *
 * @throws {Error} if some of the required variables is not set.
 */
export type ConfigReader<T> = (req: NginxHTTPRequest) => T

/**
 * Creates a function that reads the specified configuration properties from nginx
 * variables.
 *
 * Property names are expected to be in camelCase notation and corresponding nginx
 * variables in snake_case notation with the specified prefix. For example, if
 * `varPrefix` is `'oauth_'`, then property `clientSecret` is read from nginx variable
 * `oauth_client_secret`.
 *
 * @param varPrefix Prefix used for nginx variables.
 * @param template An object with all the configuration properties and their default
 *   values or `undefined` in the case of required variables.
 * @param valueConverters
 */
export const createConfigReader = <T extends Record<string, any>> (
  varPrefix: string,
  template: T,
  valueConverters: ConfigConverters<T> = {},
): ConfigReader<ValuesExclude<T, undefined>> => ({ variables }) => {

  return Object.keys(template).reduce<Record<string, any>>((config, key) => {
    const varName = varPrefix + camelToSnake(key)
    const convertValue = valueConverters[key]

    let value = variables[varName]
    if (value == null) {
      value = template[key]
    } else {
      value = convertValue ? convertValue(value) : value
    }
    if (value === undefined) {
      throw Error(`Required variable $${varName} is not set`)
    }
    config[key] = value

    return config
  }, Object.create(null)) as ValuesExclude<T, undefined>
}

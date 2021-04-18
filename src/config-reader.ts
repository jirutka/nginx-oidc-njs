import { camelToSnake, parseBoolean } from './utils'


type AtomicType = string | number | boolean | null | undefined

type ConfigDescriptor = Record<string, AtomicType | OptionDescriptor>

interface OptionDescriptor<T = unknown> {
  /**
   * The default value for this configuration option.
   * If `undefined`, the option is required and the ConfigReader will throw
   * if the corresponding nginx variable is not set by the user.
   */
  default?: T
  /**
   * A function that parsers string value of the nginx variable into the target type.
   */
  parser: (value: string) => T
}

/**
 * Derive config type from the `ConfigDescriptor` `T`.
 */
export type DeriveConfigType <T extends ConfigDescriptor> = {
  [K in keyof T]: T[K] extends OptionDescriptor
    ? ReturnType<T[K]['parser']>
    : Exclude<T[K], undefined> extends never
      ? string
      : Exclude<T[K], undefined>
}

/**
 * A function that reads configuration properties from the nginx variables.
 *
 * @throws {Error} if some of the required variables is not set.
 */
export type ConfigReader<T> = (variables: Record<string, string | undefined>) => T

/**
 * Creates a function that reads the specified configuration options from nginx
 * variables.
 *
 * Option names are expected to be in camelCase notation and corresponding nginx
 * variables in snake_case notation with the specified prefix. For example, if
 * `varPrefix` is `'oauth_'`, then option `clientSecret` is read from nginx variable
 * `oauth_client_secret`.
 *
 * @param configDescriptor An object with all the configuration options and their
 *   default values or `undefined` in the case of required variables.
 * @param varPrefix Prefix used for nginx variables.
 */
export const createConfigReader = <T extends ConfigDescriptor> (
  configDescriptor: T,
  varPrefix: string,
): ConfigReader<DeriveConfigType<T>> => (variables) => {

  return Object.keys(configDescriptor).reduce<Record<string, unknown>>((config, key) => {
    const varName = varPrefix + camelToSnake(key)
    const rawValue = variables[varName]
    const desc = configDescriptor[key]

    let value: unknown
    if (rawValue != null && rawValue !== '') {
      value = isOptionDescriptor(desc) ? desc.parser(rawValue) : parseFromStr(rawValue, typeof desc)
    } else {
      value = isOptionDescriptor(desc) ? desc.default : desc
    }
    if (value === undefined) {
      throw Error(`Required variable $${varName} is not set`)
    }
    config[key] = value

    return config
  }, Object.create(null)) as DeriveConfigType<T>
}

function isOptionDescriptor (value: any): value is OptionDescriptor {
  return typeof value === 'object' && 'parser' in value
}

function parseFromStr (value: string, type: string) {
  switch (type) {
    case 'boolean': return parseBoolean(value)
    case 'number': return parseFloat(value)
    default: return value
  }
}

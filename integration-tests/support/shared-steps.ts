import { step, Func as MochaFunc } from './mocha'


type SharedSteps = Record<string, StepFunc>

type StepFunc = (ctx: Mocha.Context, ...params: any[]) => void | Promise<void>

type StepFuncParams<T extends StepFunc> = T extends (ctx: Mocha.Context, ...args: infer P) => any ? P : never

type UseStep <T extends SharedSteps> =
  & UseStepFunc<T>
  & { [P in Prefix]: UseStepFunc<T> }

type UseStepFunc<T extends SharedSteps> =
  & (<K extends keyof T & string> (name: K, ...params: StepFuncParams<T[K]>) => ReturnType<typeof step>)
  & ((name: string, fn: MochaFunc) => ReturnType<typeof step>)

const prefixes = ['Given', 'given', 'When', 'when', 'Then', 'then', 'And', 'and'] as const
type Prefix = typeof prefixes[number]


export const defineSteps = <T extends SharedSteps> (defs: T) => defs

export const useSharedSteps = <T extends SharedSteps> (defs: T): UseStep<T> => {
  const useStep = (prefix: Prefix | ''): UseStepFunc<T> => (name: string, ...params: any[]) => {
    if (!defs[name]) {
      if (typeof params[0] === 'function') {
        return step(formatStepTitle(prefix, name), params[0])
      }
      throw RangeError(`Unknown step: "${name}"`)
    }
    const title = formatStepTitle(prefix, substitutePlaceholders(name, params))

    return step(title, (ctx) => defs[name](ctx, ...params))
  }

  return prefixes.reduce((obj, prefix) => {
    obj[prefix] = useStep(prefix)
    return obj
  }, useStep('') as UseStep<T>)
}

function substitutePlaceholders (text: string, params: any[]): string {
  let i = 0
  return text.replace(/(?<!\\)\{\w+\}/g, () => String(params[i++]))
}

function formatStepTitle (prefix: string, title: string): string {
  prefix = !prefix ? ''
    : ['given', 'when'].includes(prefix) ? `${capitalize(prefix)} `
    : `${prefix.toLowerCase()} `

  return `${prefix}${title}`
}

function capitalize (str: string): string {
  return `${str[0].toUpperCase()}${str.slice(1)}`
}

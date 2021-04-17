import * as mocha from 'mocha'
import * as mochaSteps from 'mocha-steps'
import * as mochaSuiteHooks from 'mocha-suite-hooks'

export { defineSteps, useSharedSteps } from './shared-steps'


export type Func = (this: mocha.Context, ctx: mocha.Context, done: mocha.Done) => void
export type AsyncFunc = (this: mocha.Context, ctx: mocha.Context) => PromiseLike<any>

interface HookFunction {
  (fn: Func): void
  (fn: AsyncFunc): void
  (name: string, fn: Func): void
  (name: string, fn: AsyncFunc): void
}

interface BaseTestFunction {
  (fn: Func): mocha.Test
  (fn: AsyncFunc): mocha.Test
  (title: string, fn?: Func): mocha.Test
  (title: string, fn?: AsyncFunc): mocha.Test
}

interface TestFunction extends BaseTestFunction {
  only: BaseTestFunction
  skip: BaseTestFunction
  retries (n: number): void
}

interface BaseSuiteFunction {
  (title: string, fn: (this: mocha.Suite, ctx: mocha.Suite) => void): mocha.Suite
  (title: string): mocha.Suite
}

interface SuiteFunction extends BaseSuiteFunction {
  only: BaseSuiteFunction
  skip: BaseSuiteFunction
}

type StepFunction = (title: string, fn?: Func) => mocha.Test

const patchFunction = (func: Function): any => (arg0: any, arg1: any, ...args: any): any => {
  if (typeof arg1 === 'function') {
    return func(arg0, contextify(arg1), ...args)
  } else if (typeof arg0 === 'function') {
    return func(contextify(arg0), arg1, ...args)
  }
}

function contextify <T, P extends any[], R> (fn: (this: T, ctx: T, ...args: P) => R): (this: T, ...args: P) => R {
  if (typeof fn !== 'function') {
    return fn
  }
  const decoratedFn: ((this: T, ...args: P) => R) = function (...args) {
    return fn.call(this, this, ...args)
  }
  // This is needed for "document" and "html" reporters to output original test code.
  decoratedFn.toString = () => fn.toString()

  return decoratedFn
}

function decorate (func: mocha.TestFunction): TestFunction
function decorate (func: mocha.PendingTestFunction): BaseTestFunction
function decorate (func: mocha.SuiteFunction): SuiteFunction
function decorate (func: mocha.HookFunction): HookFunction
function decorate (func: typeof mochaSteps.step): StepFunction
function decorate <F extends Function, G extends Function> (func: F): G {
  const patchedFunc = patchFunction(func)

  for (const key of Object.keys(func)) {
    let value = (func as any)[key]
    if (key === 'only' && typeof value === 'function') {
      value = patchFunction(value)
    }
    patchedFunc[key] = value
  }
  return patchedFunc
}

export const describe = decorate(mocha.describe)

export const it = decorate(mocha.it)
export const test = decorate(mocha.test)
export const xit = decorate(mocha.xit)

export const after = decorate(mocha.after)
export const afterEach = decorate(mocha.afterEach)
export const before = decorate(mocha.before)
export const beforeEach = decorate(mocha.beforeEach)

export const afterSuite = decorate(mochaSuiteHooks.afterSuite)
export const afterEachSuite = decorate(mochaSuiteHooks.afterEachSuite)
export const beforeSuite = decorate(mochaSuiteHooks.beforeSuite)
export const beforeEachSuite = decorate(mochaSuiteHooks.beforeEachSuite)

export const step = decorate(mochaSteps.step)

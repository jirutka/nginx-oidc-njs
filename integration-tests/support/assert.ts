import nodeAssert from 'node:assert'

import empower from 'empower'
import formatter from 'power-assert-formatter'

import patterns from './assert-patterns'


type Nil = undefined | null

function includes <T extends object> (actual: T | Nil, expected: Partial<T>, message?: string): void
function includes (actual: string | Nil, expected: string, message?: string): void
function includes (actual: any, expected: any, message?: string): void {
  let ok = false

  if (typeof actual === 'object' && actual !== null) {
    actual = Object.keys(expected).reduce<any>(
      (acc, key) => (acc[key] = (actual as any)[key], acc),
      {},
    )
    ok = Object.keys(expected).every(key => actual[key] === expected[key])

  } else if (typeof actual === 'string') {
    ok = actual.includes(expected)
  }

  if (!ok) {
    throw new nodeAssert.AssertionError({ actual, expected, message, operator: 'includes' })
  }
}

type NodeAssert = typeof nodeAssert

const baseAssert: NodeAssert = Object.assign(
  (...args: Parameters<NodeAssert>) => nodeAssert.strict(...args),
  nodeAssert.strict,
)

const extendedAssert = Object.assign(baseAssert, {
  includes,
})

const assert: typeof extendedAssert = empower(extendedAssert, formatter(), { patterns })

export default assert

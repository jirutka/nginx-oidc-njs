'use strict'

process.env.BABEL_ENV = 'mocha'

module.exports = {
  checkLeaks: true,
  extension: ['ts'],
  require: [
    'babel-register-ts',
    'source-map-support/register',
    './integration-tests/support/hooks.ts',
  ],
  ignore: [
    'node_modules/**',
  ],
  spec: [
    'integration-tests/**/*.test.ts',
  ],
}

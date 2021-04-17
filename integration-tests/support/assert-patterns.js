const empower = require('empower')

/** @type {import('empower-core').Pattern[]} */
module.exports = [
  ...empower.defaultOptions().patterns,
  'assert.includes(actual, expected, [message])',
]

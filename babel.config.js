'use strict'

/** @type {babel.TransformOptions} */
module.exports = {
  presets: [
    // Transpile modern JavaScript into code compatible with njs.
    'babel-preset-njs',
    // Parse TypeScript syntax and transform it to JavaScript (i.e. it strips
    // type annotations, but does not perform type checking).
    ['@babel/preset-typescript', {
      allowDeclareFields: true,
    }],
  ],
  plugins: [
    ['const-enum', {
      transform: 'constObject',
    }],
  ],
  // Strip comments.
  comments: false,
}

// This module is used for integration tests. It is not transpiled, so it must
// be written in pure JavaScript compatible with njs.

/**
 * @param {NginxHTTPRequest} r
 */
function variables (r) {
  const key = r.uri.split('/').slice(-1)

  r.headersOut['Content-Type'] = 'text/plain'

  switch (r.method) {
    case 'GET': {
      return r.variables[key] == null
        ? r.return(404)
        : r.return(200, r.variables[key])
    }
    case 'PUT': {
      r.variables[key] = r.requestText;
      return r.return(204)
    }
    case 'DELETE': {
      r.variables[key] = undefined
      return r.return(204)
    }
    default: {
      return r.return(405)
    }
  }
}

export default { variables }

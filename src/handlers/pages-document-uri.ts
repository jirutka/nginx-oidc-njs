import type { RequestHandler } from '..'
import { VAR_SITE_ROOT_URI } from '../constants'
import { assert } from '../utils'
import { findSiteRootUri, splitUriToBranchAndPagePath } from '../pages'


export const pages_document_uri: RequestHandler = (ctx) => {
  const { conf, log, vars } = ctx
  ctx.handlerType = 'variable'

  const requestUri = assert(vars.request_uri, 'request_uri must be defined')

  // `realpath_root` is undefined if `root` directory doesn't exist
  const documentRoot = vars.realpath_root
  if (!documentRoot) {
    log.warn?.('pages_document_uri: realpath_root is undefined')
    return ''
  }

  const siteRootUri = findSiteRootUri(requestUri, documentRoot, conf.pagesMinDepth, conf.pagesMaxDepth)
  if (!siteRootUri) {
    log.warn?.('pages_document_uri: site not found')
    return ''
  }

  // Cache siteRootUri in variable for the auth-pages handler. The variable must be
  // declared with `js_var` to be usable.
  if (VAR_SITE_ROOT_URI in vars) {
    vars[VAR_SITE_ROOT_URI] = siteRootUri
  } else {
    log.info?.(`pages_document_uri: variable $${VAR_SITE_ROOT_URI} is not declared`)
  }

  const [branch = conf.pagesDefaultBranch, pagePath] = splitUriToBranchAndPagePath(requestUri, siteRootUri)
  const documentUri = `${siteRootUri}@${branch}${pagePath}`

  log.debug?.(`pages_document_uri: mapping ${vars.request_uri} to ${documentUri}`)
  return documentUri
}

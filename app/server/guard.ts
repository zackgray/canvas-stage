/**
 * Dev-only endpoints that write files or spend Cloud credits must only answer the lab's own pages. A browser
 * runs a cross-origin "simple" POST (text/plain body, no preflight) and only withholds the response, so the
 * request itself has to be refused here:
 *   - an `Origin` that is present and not http://localhost[:port] / http://127.0.0.1[:port]  -> 403
 *     (also closes DNS rebinding: the rebound page's Origin is its own hostname)
 *   - `Sec-Fetch-Site: cross-site`                                                           -> 403
 *   - for JSON endpoints, a content-type other than application/json                         -> 415
 *     (a foreign page can only send that after a CORS preflight, which these endpoints never grant)
 * Requests with no Origin (curl, scripts on this machine) pass the origin checks.
 */
import type { IncomingMessage } from 'node:http'

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

export interface Refusal {
  status: number
  message: string
}

export function refuseForeign(req: IncomingMessage, opts: { json?: boolean } = {}): Refusal | null {
  const origin = req.headers.origin
  if (origin !== undefined && !LOCAL_ORIGIN.test(origin)) return { status: 403, message: 'local pages only' }
  if (req.headers['sec-fetch-site'] === 'cross-site') return { status: 403, message: 'local pages only' }
  if (opts.json) {
    const type = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
    if (type !== 'application/json') return { status: 415, message: 'content-type must be application/json' }
  }
  return null
}

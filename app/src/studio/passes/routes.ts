/** The pass-candidate routes, shared by the server plugin and the client hook so they cannot drift. */
export const PASS_ROUTE = '/__lab/passes'
export const PASS_KEEP = `${PASS_ROUTE}/keep`
export const PASS_DISCARD = `${PASS_ROUTE}/discard`
/** free: fetch a running or failed candidate's job by id and complete it; never submits */
export const PASS_RECOVER = `${PASS_ROUTE}/recover`

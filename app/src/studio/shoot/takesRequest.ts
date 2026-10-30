// One takes-list request at a time for the whole page (fix 2026-10-30). The Stage had a dozen readers of GET /__lab/takes, each
// refetching on mount and on a take switch, so one switch sent 12-20 full-list requests at once, each running the server's
// adoption pass. Now a call while a request is out waits for ONE follow-up request that starts after it ends, shared by every
// caller that arrives meanwhile: a burst costs at most two requests, and every caller still gets a list read after its own call
// began (a take locked or adopted just before the call is in it, as before).

type Load<T> = () => Promise<T>
/** the coalesced call, and `reset` (tests): forget the request out, so the next call sends its own */
export type Coalesced<T> = Load<T> & { reset: () => void }

/** `load` coalesced: concurrent calls share the request in flight's follow-up instead of each sending their own */
export function coalesced<T>(load: Load<T>): Coalesced<T> {
  let inflight: Promise<T> | null = null
  let queued: Promise<T> | null = null
  const start = (): Promise<T> => {
    const p: Promise<T> = load().finally(() => { if (inflight === p) inflight = null })
    inflight = p
    return p
  }
  const call = () => {
    if (!inflight) return start()
    // read after the request out now ends (so after this call began); every caller until it starts shares it
    const q: Promise<T> = queued ??= inflight.then(() => undefined, () => undefined).then(() => { if (queued === q) queued = null; return start() })
    return q
  }
  return Object.assign(call, { reset: () => { inflight = null; queued = null } })
}

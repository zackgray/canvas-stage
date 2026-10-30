/**
 * "Release" for a paid job that stopped answering: stop WAITING for it, never stop the job. The Cloud job is not cancelled and not
 * resubmitted; its id stays on the runner's record (needs-recover) so Recover fetches it by id, and it may still bill. Pieces that
 * hold the queue register a hook against the recorded scene job (scene + id) and a release fires them:
 *  - the runner's wait (`ends`): the wait gives up, the record becomes needs-recover, the route answers with its own Recover error, and
 *    the runner's lock and the section's claim are freed by the route ending as it always does;
 *  - a section's claim: dropped, so the next job of the section starts even if the route itself is stuck somewhere this cannot reach.
 * Pinned on globalThis like the lock and the claims (Vite's in-process restart re-bundles this module while requests are in flight).
 */
import type { JobContext } from './context.ts'

const KEY = Symbol.for('canvas-stage.jobs.release')
interface Hook { fn: () => void; ends: boolean }
const hooks = (): Map<string, Set<Hook>> => ((globalThis as Record<symbol, Map<string, Set<Hook>> | undefined>)[KEY] ??= new Map())

export const releaseKey = (c: Pick<JobContext, 'scene' | 'id'>): string => `${c.scene}/${c.id}`

/** thrown into a wait that was released: the Cloud job is still out there */
export class ReleasedError extends Error {
  constructor() {
    super('released: stopped waiting for it; Cloud may still finish it and bill it. Recover fetches it by id; nothing is sent again')
  }
}

/** registers `fn` to run when the job is released; `ends` = the route ends by itself once `fn` ran. Returns the unregister. */
export function onRelease(key: string, fn: () => void, ends = false): () => void {
  const h: Hook = { fn, ends }
  const set = hooks().get(key) ?? new Set<Hook>()
  set.add(h); hooks().set(key, set)
  return () => { set.delete(h); if (!set.size && hooks().get(key) === set) hooks().delete(key) }
}

/** fires the job's hooks; how many of them make the route end by itself (0 = nothing will answer for it: the caller marks the record) */
export function fireRelease(key: string): { fired: number; ends: number } {
  const set = [...(hooks().get(key) ?? [])]
  for (const h of set) { try { h.fn() } catch { /* a hook that throws must not keep the others from freeing the queue */ } }
  return { fired: set.length, ends: set.filter((h) => h.ends).length }
}

/** `wait` for a recorded job, ended with ReleasedError when the job is released; a call that is not a recorded job waits as before */
export function waitOrRelease<T>(wait: Promise<T>, ctx: JobContext | null): Promise<T> {
  if (!ctx) return wait
  wait.catch(() => {}) // abandoned by a release: its late outcome is nobody's
  let off = () => {}
  const released = new Promise<never>((_, reject) => { off = onRelease(releaseKey(ctx), () => reject(new ReleasedError()), true) })
  return Promise.race([wait, released]).finally(off)
}

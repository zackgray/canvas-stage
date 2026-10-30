/**
 * "Is a job of this section running?" answered so that a page refresh or a dev-server restart cannot forget it.
 * Two sources, both outliving the module that started the job:
 *  - claims: a process-wide map pinned on globalThis. Vite's in-process restart re-bundles every plugin module (fresh
 *    module state) but keeps the Node process, so a claim taken by the old module is still seen by the new one. It
 *    covers the window before the runner has written its on-disk record (validation, uploads).
 *  - the runner's in-flight records (experiments/jobs/job-*.json), matched by label: `submitting` / `waiting` and
 *    written by a process that is still alive (pid) within the longest a job can wait. A record left `waiting` by a
 *    process that died is not "running" any more: its job is recovered by id, never re-run.
 */
import { jobContext, leftBeforeTurn, QUEUE_POLL_MS } from './context.ts'
import { onRelease, releaseKey } from './release.ts'
import type { JobStore } from './store.ts'
import type { JobRecord } from './types.ts'

const KEY = Symbol.for('canvas-stage.jobs.claims')
type Claims = Map<string, { since: string; what: string }>
const claims = (): Claims => ((globalThis as Record<symbol, Claims | undefined>)[KEY] ??= new Map())

/** A waiting record older than this cannot still be waited on (30-min wait cap x up to 3 attempts + settle). */
export const MAX_LIVE_MS = 100 * 60_000

/** True when `pid` is a running process (signal 0 tests existence only). */
export function pidAlive(pid: number | undefined): boolean {
  if (!Number.isInteger(pid) || (pid as number) <= 0) return false
  try { process.kill(pid as number, 0); return true } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM' }
}

/** A record whose job a live process is still submitting or waiting on. */
export function isLive(r: JobRecord, now = Date.now()): boolean {
  if (r.status !== 'submitting' && r.status !== 'waiting') return false
  if (now - Date.parse(r.updatedAt) > MAX_LIVE_MS) return false
  return r.pid === undefined ? true : pidAlive(r.pid)
}

export interface Running { since: string; what: string; recordId?: string; jobId?: string }

/** The section's running job: its claim, else a live record whose label matches. */
export function running(key: string, store: JobStore, match: (label: string) => boolean): Running | null {
  const c = claims().get(key)
  const rec = store.open().find((r) => match(r.label) && isLive(r))
  if (rec) return { since: rec.createdAt, what: rec.label, recordId: rec.id, jobId: rec.jobId }
  return c ? { ...c } : null
}

export class BusyError extends Error {
  readonly status = 409
  readonly running: Running
  constructor(r: Running, other = false) {
    super(other ? `another paid job is running: ${r.what} (started ${r.since}); wait for it to finish, then press again`
      : `busy: ${r.what} is still running (started ${r.since}); wait for it, do not press again`)
    this.running = r
  }
}

/** A section another one must not queue behind (its claim key and its runner label). */
export interface Section { key: string; match: (label: string) => boolean }

/**
 * Runs `fn` as the section's one job: refused (BusyError, 409) while a claim or a live record says one runs, or while one of
 * `others` runs (paid sections that would otherwise wait silently behind each other on the runner's one-at-a-time lock).
 * A recorded scene job (context.ts) is never refused for another job: it waits until the section and `others` are free, its record
 * saying "waiting" meanwhile (any other paid job is left to the runner's lock, which says so too); a job whose page leaves while
 * it waits is dropped with a free refusal (JobError 'left') before it claims anything. The same press twice is refused before
 * this, by the page's job store and by the job capture (one running job per scene, intent and target).
 * Every check and the claim happen synchronously, so two requests in the same tick cannot both pass.
 */
export async function exclusive<T>(key: string, what: string, store: JobStore, match: (label: string) => boolean, fn: () => Promise<T>, others: Section[] = []): Promise<T> {
  const job = jobContext()
  if (job) {
    // its section, and the sections it must not run beside (a kit still's draw and finish are one press: nothing slips between)
    const busy = () => !!running(key, store, match) || others.some((o) => !!running(o.key, store, o.match))
    if (busy()) {
      job.waiting(true)
      while (busy()) {
        const left = leftBeforeTurn(job) // the page went away while it waited: dropped, free, before it claims anything
        if (left) throw left
        await new Promise((r) => setTimeout(r, QUEUE_POLL_MS))
      }
      job.waiting(false)
    }
    const left = leftBeforeTurn(job)
    if (left) throw left
  } else {
    const r = running(key, store, match)
    if (r) throw new BusyError(r)
    for (const o of others) {
      const busy = running(o.key, store, o.match)
      if (busy) throw new BusyError({ ...busy, what: claims().get(o.key)?.what ?? busy.what }, true) // its plain name when this process runs it
    }
  }
  const mine = { since: new Date().toISOString(), what }
  claims().set(key, mine)
  const drop = () => { if (claims().get(key) === mine) claims().delete(key) } // never the claim a later job took
  // a released job (jobs/release.ts) no longer holds the section, even if its route is stuck where nothing can end it
  const off = job ? onRelease(releaseKey(job), drop) : () => {}
  try { return await fn() } finally { off(); drop() }
}

/** The section's claim as this process holds it (or null): when it was taken and for what. */
export const claimOf = (key: string): { since: string; what: string } | null => { const c = claims().get(key); return c ? { ...c } : null }

/** Tests only: forget every claim (a whole new process). */
export const resetClaims = (): void => claims().clear()

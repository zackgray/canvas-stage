// The per-scene store of paid jobs in flight (libraryContract.ts SceneJobRecord). It lives outside every component, so a job keeps
// its button disabled on every screen that shows it, whichever screen started it (M2), and its result is applied by whichever
// screen is there when it lands (M1). The page names the job before it sends; the server records it under that id and keeps the
// route's own reply there until a page claims it, so a reload re-attaches by polling and applies the stored reply exactly as the
// original response would have been applied. A paid press never goes out without its price (m14) or while the same job runs.
import { JOB_HEADERS, JOB_ROUTES, type JobIntent, type SceneJobRecord } from '../shared/libraryContract'
import { libraryApi, type Fetch, type LibraryApi } from '../library/api'

export const PRICE_LOADING = 'The price is still loading. Press again in a moment.'
/** a press queued behind another paid job (any scene's): it starts by itself, nothing is billed until it does, and a page that
 *  closes or reloads before then drops it (server/jobs/context.ts). Short: it sits under a step's title while it waits. */
export const WAITING = 'Queued. Nothing is spent until it starts.'
/** the class for a line that may be the waiting line: neutral for it, a warning for anything else */
export const lineClass = (line: string | null | undefined): string => (line === WAITING ? 'st-muted' : 'st-warn')
/** a job the user released (Not responding -> Release): it is no longer waited on; its Cloud job was not touched */
export const JOB_RELEASED = 'You released this job while it was not responding. It may still finish and bill; its Recover button fetches it by id. Nothing was sent again.'
export const JOB_LOST = 'The server restarted while this paid job was running. If it was billed, its Recover button fetches it by id; nothing is sent again.'
/** another tab's finished job is left to that tab this long before this one applies it */
export const CLAIM_GRACE_MS = 5000

/** refused on this side, nothing sent: no price yet, or the same job already runs */
export class JobRefused extends Error {}
/** the screen that pressed is gone; the result is applied by the next screen that shows it (callers ignore this) */
export class JobDetached extends Error {}

export interface JobTag {
  intent: JobIntent
  /** what the job is for inside its intent ("tile:p3", a take id); one running job per intent and target */
  target?: string
  /** the credits on the button; a paid press with no loaded price is refused */
  price: number | null | undefined
  /** the hook that pressed (useJobConsumer's token): while it is mounted the caller applies the result itself */
  owner?: object
}

/** a screen that applies finished jobs of these intents: `parse` turns a stored reply into what the call would have returned */
export interface JobConsumer {
  intents: readonly JobIntent[]
  parse?: (job: SceneJobRecord, reply: { status: number; body: unknown }) => Promise<unknown>
  apply: (job: SceneJobRecord, outcome: Promise<unknown>) => void | Promise<void>
}

/** a job queued behind another paid job (SceneJobRecord.waiting, server/scene/jobRecords.ts) */
export const isWaiting = (j: SceneJobRecord | null | undefined): boolean => !!j?.waiting

interface Local extends SceneJobRecord {
  owner?: object
  /** this page's call is still out */
  pending?: boolean
  /** the call went out with the job's headers (the server keeps a record) / the server answered it */
  sent?: boolean
  answered?: boolean
  /** this page (or this browser before a reload) sent it */
  mine?: boolean
  /** the in-page call's outcome, kept for the next screen when the one that pressed is gone */
  result?: Promise<unknown>
}

export interface JobsSnapshot { jobs: readonly SceneJobRecord[]; holds: Readonly<Record<string, number>> }

let ambient: { rec: Local; headers: Record<string, string> } | null = null
/** fetch for paid calls: the first request made inside a job's call carries its headers (every paid client uses this) */
export const jobFetch: Fetch = (input, init) => {
  const a = ambient
  if (!a) return fetch(input, init)
  ambient = null
  a.rec.sent = true
  return fetch(input, { ...init, headers: { ...(init?.headers as Record<string, string> | undefined), ...a.headers } })
    .then((res) => { a.rec.answered = true; return res })
}

const rand = () => Math.random().toString(36).slice(2, 8).padEnd(6, '0')
const strip = ({ owner: _o, pending: _p, result: _r, answered: _a, ...r }: Local): SceneJobRecord & { sent?: boolean; mine?: boolean } => r

export class SceneJobs {
  readonly scene: string | null
  private readonly api: LibraryApi
  private readonly storage: Storage | null
  /** this page's clock (tests inject one): the hang notice reads it too */
  readonly now: () => number
  private jobs = new Map<string, Local>()
  private holds = new Map<string, number>()
  private consumers = new Map<object, JobConsumer>()
  private delivering = new Set<string>()
  /** jobs this page applied (or handed back to the pressing caller): never applied again, even while their clear has not gone through */
  private applied = new Set<string>()
  private clearing = new Set<string>()
  private subs = new Set<() => void>()
  private snap: JobsSnapshot = { jobs: [], holds: {} }

  constructor(scene: string | null, io: { api?: LibraryApi; storage?: Storage | null; now?: () => number } = {}) {
    this.scene = scene
    this.api = io.api ?? libraryApi()
    this.now = io.now ?? Date.now
    this.storage = scene ? (io.storage === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : io.storage) : null
    try { for (const r of JSON.parse(this.storage?.getItem(this.key) ?? '[]') as Local[]) this.jobs.set(r.id, { ...r, mine: true }) } catch { /* none */ }
    this.publish()
  }

  private get key() { return `canvas-stage.jobs.${this.scene}` }
  private publish() {
    this.snap = { jobs: [...this.jobs.values()].map(strip), holds: Object.fromEntries(this.holds) }
    try { this.storage?.setItem(this.key, JSON.stringify([...this.jobs.values()].filter((j) => j.mine).map(strip))) } catch { /* full or blocked */ }
    this.subs.forEach((f) => f())
  }

  subscribe = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f) } }
  snapshot = (): JobsSnapshot => this.snap
  /** the running job of this intent (and target, when given), or null */
  running(intent: JobIntent, target?: string): SceneJobRecord | null {
    return this.snap.jobs.find((j) => j.status === 'running' && j.intent === intent && (target === undefined || j.target === target)) ?? null
  }
  /** a client-side batch in progress (Generate the board's run of tiles): when it began, or null */
  held = (key: string): number | null => this.holds.get(key) ?? null

  /** `fn` as one held batch: shown as running everywhere until it settles (memory only: a reload ends the loop that holds it) */
  async hold<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.holds.has(key)) throw new JobRefused('already running')
    this.holds.set(key, this.now()); this.publish()
    try { return await fn() } finally { this.holds.delete(key); this.publish() }
  }

  /**
   * One paid call as a job of this scene. `fn` makes the call; its first request through jobFetch goes out with the job's headers
   * (they are also handed to `fn`). Refused before anything is sent without a price or while the same job runs. When the pressing
   * hook is still mounted its call resolves as usual; when it is gone, the result waits for the next consumer and this rejects
   * with JobDetached.
   */
  async run<T>(tag: JobTag, fn: (headers: Record<string, string>) => Promise<T>): Promise<T> {
    if (typeof tag.price !== 'number' || !Number.isFinite(tag.price)) throw new JobRefused(PRICE_LOADING)
    const target = tag.target ?? tag.intent
    if (this.running(tag.intent, target)) throw new JobRefused('This is already running.')
    const id = `j-${this.now().toString(36)}-${rand()}`
    const rec: Local = { id, scene: this.scene ?? '', intent: tag.intent, target, price: tag.price, route: JOB_ROUTES[tag.intent],
      status: 'running', startedAt: new Date(this.now()).toISOString(), owner: tag.owner, pending: true, mine: true }
    this.jobs.set(id, rec); this.publish()
    const headers: Record<string, string> = this.scene
      ? { [JOB_HEADERS.scene]: this.scene, [JOB_HEADERS.job]: id, [JOB_HEADERS.target]: target, [JOB_HEADERS.price]: String(tag.price) } : {}
    let p: Promise<T>
    ambient = this.scene ? { rec, headers } : null
    try { p = fn(headers) } catch (e) { p = Promise.reject(e) } finally { ambient = null }
    let ok = true, value: T | undefined, error: unknown
    try { value = await p } catch (e) { ok = false; error = e }
    rec.pending = false
    if (!ok && rec.sent && !rec.answered) { // the request went out and no answer came back: the server may still finish it
      this.publish(); void this.sync(); throw new JobDetached('the connection dropped; the result is applied when it lands')
    }
    rec.status = 'done'; rec.finishedAt = new Date(this.now()).toISOString()
    if (!tag.owner || this.consumers.has(tag.owner)) {
      this.jobs.delete(id); this.publish()
      if (rec.sent) { this.applied.add(id); void this.claim(rec) }
      if (ok) return value as T
      throw error
    }
    rec.result = ok ? Promise.resolve(value) : Promise.reject(error)
    rec.result.catch(() => {})
    this.publish(); this.deliver()
    throw new JobDetached('the screen that pressed is gone; the next one applies the result')
  }

  /** a screen that applies finished jobs; returns its release. Anything waiting for it is handed over now. */
  own(owner: object, c: JobConsumer): () => void {
    this.consumers.set(owner, c); this.deliver()
    return () => { if (this.consumers.get(owner) === c) this.consumers.delete(owner) }
  }

  private async claim(j: Local): Promise<boolean> {
    if (!this.scene) return true
    try { return await this.api.clearJob(this.scene, j.id) } catch { return !!j.result || !!j.reply }
  }

  private deliver() {
    for (const j of this.jobs.values()) {
      if (j.status === 'running' || j.pending || this.delivering.has(j.id)) continue
      if (!j.mine && Date.parse(j.finishedAt ?? j.startedAt) + CLAIM_GRACE_MS > this.now()) continue
      const c = [...this.consumers.values()].find((x) => x.intents.includes(j.intent))
      if (!c || (!j.result && j.status === 'done' && (!c.parse || !j.reply))) continue
      this.delivering.add(j.id)
      void (async () => {
        const claimed = !j.result || j.sent ? await this.claim(j) : true
        this.jobs.delete(j.id); this.delivering.delete(j.id); this.publish()
        if (!claimed) return
        this.applied.add(j.id)
        const outcome = j.result ?? (j.status === 'lost' ? Promise.reject(new Error(j.released ? JOB_RELEASED : JOB_LOST)) : c.parse!(strip(j), j.reply!))
        outcome.catch(() => {})
        try { await c.apply(strip(j), outcome) } catch { /* the consumer says its own errors */ }
      })()
    }
  }

  /** one look at the server's records: jobs from before a reload or another tab show, finished ones are handed over */
  async sync(): Promise<void> {
    if (!this.scene) return
    let server: SceneJobRecord[]
    try { server = await this.api.jobs(this.scene) } catch { return }
    const known = new Set(server.map((r) => r.id))
    for (const r of server) {
      // applied here already, its clear failed (m-4): clear it again, never hand it to a consumer a second time
      if (this.applied.has(r.id)) { void this.clearAgain(r.id); continue }
      const loc = this.jobs.get(r.id)
      // this page's call is still out: only whether it waits its turn behind another job is taken from the server
      if (loc?.pending && loc.status === 'running') { if (isWaiting(r)) loc.waiting = true; else delete loc.waiting; continue }
      if (loc?.pending || this.delivering.has(r.id)) continue
      if (!loc) this.jobs.set(r.id, { ...r })
      else if (!loc.result) { delete loc.waiting; Object.assign(loc, r) }
    }
    // never reached the server (a reload before the POST went out), or claimed by another tab: nothing to wait for
    for (const j of [...this.jobs.values()]) if (!j.pending && !j.result && !known.has(j.id) && !this.delivering.has(j.id)) this.jobs.delete(j.id)
    for (const id of [...this.applied]) if (!known.has(id)) this.applied.delete(id) // its record is gone: nothing left to clear
    this.publish(); this.deliver()
  }

  private async clearAgain(id: string) {
    if (!this.scene || this.clearing.has(id)) return
    this.clearing.add(id)
    try { await this.api.clearJob(this.scene, id) } catch { /* the next sync tries again */ } finally { this.clearing.delete(id) }
  }

  /** re-attach: sync now and every `ms` until the returned stop is called */
  attach(ms = 2500): () => void {
    void this.sync()
    const t = setInterval(() => void this.sync(), ms)
    return () => clearInterval(t)
  }
}

const stores = new Map<string, SceneJobs>()
/** the store of one scene (one per page); null = no scene (tests): in memory only, nothing sent to the library */
export function sceneJobs(scene: string | null): SceneJobs {
  const k = scene ?? ''
  let s = stores.get(k)
  if (!s) { s = new SceneJobs(scene); stores.set(k, s) }
  return s
}
/** tests only */
export const resetSceneJobs = () => stores.clear()

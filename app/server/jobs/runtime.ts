/**
 * The runner's state bundle (deps, store, budget, object_info cache, one-at-a-time lock) and the process-wide instance.
 * `jobRuntime()` is lazy: it reads CANVAS_DAY_BUDGET at each check and the Comfy target at first use, so the plugins
 * (which copy .env values into process.env at server start) can come up in any order. Tests build their own with
 * createRuntime and fake deps; nothing here touches the network until a real dep is called.
 */
import path from 'node:path'
import { bindFile, comfy, fetchObjectInfo, resolveDiscoveryTarget, sdkTargetsCloud } from '../comfy/index.ts'
import { balanceCents } from '../stills/ledger.ts'
import { Budget, parseCap } from './budget.ts'
import { ObjectInfoCache } from './objinfo.ts'
import { JobStore } from './store.ts'
import type { JobDeps } from './types.ts'

/** Jobs run one at a time: overlapping jobs blur the balance deltas that price them. */
export class Lock {
  private tail: Promise<unknown> = Promise.resolve()
  waiting = 0
  run<T>(fn: () => Promise<T>): Promise<T> {
    this.waiting++
    const p = this.tail.then(fn, fn).finally(() => { this.waiting-- })
    this.tail = p.catch(() => {})
    return p
  }
}

export interface JobRuntime {
  deps: JobDeps
  store: JobStore
  budget: Budget
  info: ObjectInfoCache
  logPath: string
  lock: Lock
}

export interface RuntimeOpts {
  deps: JobDeps
  /** folder for in-flight records + budget.json */
  dir: string
  /** credit-log.md */
  logPath: string
  /** object_info cache file */
  infoFile: string
  cap: () => number | null
  today?: () => string
}

export function createRuntime(o: RuntimeOpts): JobRuntime {
  return {
    deps: o.deps,
    store: new JobStore(o.dir),
    budget: new Budget(path.join(o.dir, 'budget.json'), o.cap, o.today),
    info: new ObjectInfoCache(o.deps.fetchInfo, o.infoFile),
    logPath: o.logPath,
    lock: new Lock(),
  }
}

const APP = path.resolve(import.meta.dirname, '..', '..')

/**
 * The object_info cache per Comfy target: Cloud's node list is not a local ComfyUI's, so a graph is never validated against the
 * other one's cached copy (Cloud keeps the old file name; a self-hosted target gets one named by its host).
 */
export function objectInfoFile(dir: string): string {
  if (sdkTargetsCloud()) return path.join(dir, 'object_info.json')
  let host = 'comfyui'
  try { host = resolveDiscoveryTarget('comfyui').label } catch { /* no address: one shared local name */ }
  return path.join(dir, `object_info-${host.replace(/[^\w.-]+/g, '_')}.json`)
}

export const realJobDeps = (): JobDeps => ({
  submit: (wf) => comfy().submit(wf),
  getJob: (id) => comfy().jobs.get(id),
  balance: balanceCents,
  fetchInfo: () => fetchObjectInfo(resolveDiscoveryTarget(sdkTargetsCloud() ? 'cloud' : 'comfyui')),
  settleMs: 20_000,
  retryMs: 120_000,
  bind: (wf, node, field, file) => bindFile(wf, node, field, file),
})

// The process-wide lock lives on globalThis: Vite's in-process restart re-bundles this module, and a fresh lock would let
// the new module submit while the old one still waits on its job. Deps stay per module (a restart picks up a new key).
const LOCK = Symbol.for('canvas-stage.jobs.lock')
const processLock = (): Lock => ((globalThis as Record<symbol, Lock | undefined>)[LOCK] ??= new Lock())

let shared: JobRuntime | undefined
let override: JobRuntime | undefined

/** The process-wide runner state every endpoint shares (so the lock and the day budget are global). */
export function jobRuntime(): JobRuntime {
  if (override) return override
  shared ??= createRuntime({
    deps: realJobDeps(),
    dir: path.join(APP, 'experiments', 'jobs'),
    logPath: path.join(APP, 'experiments', 'credit-log.md'),
    // its own file: experiments/cache/object_info.json is the raw object_info the graph tests and scripts read
    infoFile: objectInfoFile(path.join(APP, 'experiments', 'jobs')),
    cap: () => parseCap(process.env.CANVAS_DAY_BUDGET),
  })
  shared.lock = processLock()
  return shared
}

/** Tests only: replace (or with undefined, clear) the process-wide instance. */
export function setJobRuntime(rt: JobRuntime | undefined): void { override = rt }

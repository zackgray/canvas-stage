// The Describe-a-move panel's calls to the labMotion plugin routes (server/motion/plugin.ts, docs/motion-box-contract.md).
// The browser never talks to the motion box itself; every call goes through the dev server, which holds the box's address and
// shared secret. User-facing copy never renders these errors verbatim (the messages are server words, e.g. the stalled line);
// the panel answers with its own plain copy and uses these only to pick the state.
import type { BoxJobStatus, MotionHealth } from '../../../../server/motion/types'
import type { MoveSpec } from '../../../stage3d/moves/index.ts'

/** the job as the panel sees it: the plugin's bookkeeping can add 'lost' (polls failing, plan 1.4) */
export type PanelJobStage = BoxJobStatus['stage'] | 'lost'
export type PanelJob = Omit<BoxJobStatus, 'stage'> & {
  stage: PanelJobStage
  /** ms epoch the make started */
  startedAt?: number
  /** whose move it is (the kit world) and the words it was made from, when the make said */
  owner?: string
  words?: string
  /** which ranked try the panel shows (0 = the best) */
  shown?: number
  /** the spec it was made from (Try another makes a fresh round from it) */
  spec?: unknown
}

/** a kept try as the keep route returns it: the new user clip's id ("gen:<motion-id>") and its clip record */
export type KeptMove = { id: string; clip: Record<string, unknown> }

export class MotionHttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'MotionHttpError'
    this.status = status
  }
}

const BASE = '/__lab/motion'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new MotionHttpError(res.status, body?.error ?? res.statusText)
  }
  return (await res.json()) as T
}

const post = <T>(path: string, body: unknown) =>
  req<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

/** GET /health: off / offline / warming / busy / ready (the plugin probes the box with a 2 s timeout, cached 10 s) */
export const motionHealth = async (): Promise<MotionHealth> => (await motionHealthInfo()).state
/** the same, with the box's own seconds per try when it reports them (how long a make takes) */
export const motionHealthInfo = (): Promise<{ state: MotionHealth; secondsPerTry?: number }> => req('/health')

/** POST /make: starts the box job and writes the on-disk in-flight record; 409 when the box's one-slot queue is full */
export const motionMake = (spec: MoveSpec, n?: number, about: { owner?: string; words?: string } = {}) =>
  post<{ jobId: string }>('/make', { spec, ...(n ? { n } : {}), ...about })

/** POST /shown: which ranked try the panel shows now (kept with the result, so it survives a reload) */
export const motionShown = (job: string, shown: number) => post<{ shown: number }>('/shown', { job, shown })

/** POST /discard: the result is done with (used, discarded or replaced) */
export const motionDiscard = (job: string) => post<Record<string, never>>('/discard', { job })

/** GET /job: the in-flight make, or null when none (404). A finished job keeps answering so its tries can still be kept. */
export async function motionJob(): Promise<PanelJob | null> {
  try {
    return await req<PanelJob>('/job')
  } catch (e) {
    if (e instanceof MotionHttpError && e.status === 404) return null
    throw e
  }
}

/** POST /cancel: stops after the current try */
export const motionCancel = () => post<{ stage: string }>('/cancel', {})

/** POST /keep: downloads the try into the user-clip folder and returns the new clip id and record (plan 1.5) */
export const motionKeep = (job: string, tryId: number | string, label: string) =>
  post<{ id: string; clip: Record<string, unknown> }>('/keep', { job, try: tryId, label })

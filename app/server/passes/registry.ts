/**
 * What the pass tracks plug into (wave 3): the per-target APPLIER that makes a kept result the approved image/render, the
 * per-pass RECOVERER that completes a billed candidate by its job id, and the per-pass SETTLER that the restart settle
 * (settle.ts) asks what "in flight here" means. All live here so the store and the routes know no pass.
 */
import type { PassCandidate, PassKind, PassTarget } from '../../src/shared/passContract.ts'
import type { JobStore } from '../jobs/index.ts'

export interface PassCtx { publicDir: string }

export interface PassApplier {
  /** the target's URL right now (the still's png, the render's finished mp4); null when it is gone. Keep refuses when it is not beforeUrl */
  current(target: PassTarget, ctx: PassCtx, c: PassCandidate): Promise<string | null>
  /** make afterUrl the approved image/render, keeping the earlier file on disk; returns the URL it replaced */
  apply(c: PassCandidate, ctx: PassCtx): Promise<{ replacedUrl: string }>
}

/** what a recoverer hands back once the job's outputs are on disk */
export interface PassRecovered { afterUrl: string; beforeCropUrl?: string | null; afterCropUrl?: string | null; costCredits?: number | null }
/** fetches the candidate's EXISTING job by id (server/jobs/recover.ts recoverJob) and finishes its files; must never submit */
export type PassRecoverer = (c: PassCandidate, ctx: PassCtx) => Promise<PassRecovered>

/** how a pass knows its own in-flight work, for the restart settle */
export interface PassSettler {
  /** the runner's job store (its records carry the job id once submitted) */
  store(): JobStore
  /** the runner's label for this candidate's job */
  label(c: PassCandidate): string
  /** the section this pass holds (exclusive) from before the candidate until the job ends: held = maybe between the write and the submit */
  key: string
  /** this process still runs it (a finer check than the section, when the pass keeps one) */
  active?(c: PassCandidate): boolean
  /** the failed candidate's message: never sent, nothing billed */
  interrupted: string
}

const appliers = new Map<PassTarget['kind'], PassApplier>()
const recoverers = new Map<PassKind, PassRecoverer>()
const settlers = new Map<PassKind, PassSettler>()

export const registerApplier = (targetKind: PassTarget['kind'], applier: PassApplier): void => { appliers.set(targetKind, applier) }
export const registerRecoverer = (pass: PassKind, fn: PassRecoverer): void => { recoverers.set(pass, fn) }
export const applierOf = (kind: PassTarget['kind']) => appliers.get(kind)
export const recovererOf = (pass: PassKind) => recoverers.get(pass)
export const registerSettler = (pass: PassKind, s: PassSettler): void => { settlers.set(pass, s) }
export const settlerOf = (pass: PassKind) => settlers.get(pass)
/** tests only */
export const resetRegistry = (): void => { appliers.clear(); recoverers.clear(); settlers.clear() }

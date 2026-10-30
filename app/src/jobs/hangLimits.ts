// How long a running paid job may go before the page calls it "not responding" (and the server lets it be released).
// Derived from experiments/credit-log.md: 3x the longest billed execution of that job's kind, times the billed jobs one press can
// run, never under a floor. Pure (no React, no node): the page and the server read the same table, and a test re-derives it from
// the ledger so a longer billed job that lands there fails until the table is raised. A limit only OFFERS Check / Release; nothing
// here cancels or resubmits anything.
import type { JobIntent, SceneJobRecord } from '../shared/libraryContract.ts'

export const HANG_FACTOR = 3
/** no kind is called hung sooner than this (cold model loads and queue time on Cloud can look like a stall for minutes) */
export const HANG_FLOOR_MS = 10 * 60_000

/** the longest billed execution seen in the ledger for the kind's workflows, in seconds (null = the kind makes no Comfy job: an LLM call) */
export const LONGEST_EXEC_S: Record<JobIntent, number | null> = {
  develop: null, flesh: null, plan: null,
  concept: 106, // scene-concept
  cast: 64, // cast
  master: 116, // bible-master
  hero: 66, // hero-still
  heroFinish: 66, // hero-still
  l2r: 211, // l2r
  frameEdit: 66, // hero-still (an edit's job is labelled with the hero prefix; the qwen edit runs about as long as a draw)
}

/** billed jobs one press of the kind may run back to back (a kit still: its draw, then its finish) */
export const JOBS_PER_PRESS: Record<JobIntent, number> = {
  develop: 1, flesh: 1, plan: 1, concept: 2, cast: 2, master: 1, hero: 2, heroFinish: 1, l2r: 1, frameEdit: 1,
}

/** the ledger workflow-name prefix each Comfy-backed kind is measured against (the test re-derives LONGEST_EXEC_S from these) */
export const LEDGER_PREFIX: Partial<Record<JobIntent, string>> = {
  concept: 'scene-concept', cast: 'cast', master: 'bible-master', hero: 'hero-still', heroFinish: 'hero-still', l2r: 'l2r', frameEdit: 'hero-still',
}

export function hangLimitMs(intent: JobIntent): number {
  const exec = LONGEST_EXEC_S[intent]
  return Math.max(HANG_FLOOR_MS, exec === null ? 0 : HANG_FACTOR * exec * JOBS_PER_PRESS[intent] * 1000)
}

/** when the job last started doing work: after it stopped waiting its turn, else when it was pressed */
const ranFrom = (j: SceneJobRecord): number => Date.parse(j.ranAt ?? j.startedAt)

/** a running job (not one queued behind another) that has run longer than its kind's limit */
export function isHung(j: SceneJobRecord | null | undefined, now: number): boolean {
  if (!j || j.status !== 'running' || j.waiting || j.released) return false
  const from = ranFrom(j)
  return Number.isFinite(from) && now - from > hangLimitMs(j.intent)
}

/**
 * Validating Look requests, the grade cap and ids. Pure, so it is unit-tested; the runner and the plugin do the I/O.
 */
import { isExportFolder } from '../stills/exports.ts'
import { isStillId, StillCap } from '../stills/request.ts'
import type { DofFormat, FinishDof, FinishPreset, FinishRequest, GradeRequest } from './types.ts'

/** An Error carrying the HTTP status the plugin answers with. */
export const httpError = (status: number, message: string) => Object.assign(new Error(message), { status })

const LOOK_ID_RE = /^(grade|finish)-[\w-]+$/
const PRESETS: FinishPreset[] = ['off', 'subtle', 'film']
const DOF_FORMATS: DofFormat[] = ['ff', 'lf', 's35']
/** f-stops and focus the finish accepts; focus has the viewport's bounds (engine/dof.ts MIN/MAX_FOCUS_M). */
export const DOF_LIMITS = { fMin: 1, fMax: 32, focusMin: 0.05, focusMax: 1000 } as const

export const isLookId = (id: string) => LOOK_ID_RE.test(id) && !id.includes('..')

export function parseGradeRequest(body: unknown): GradeRequest {
  if (!body || typeof body !== 'object') throw httpError(400, 'body must be a JSON object')
  const b = body as Record<string, unknown>
  const folder = String(b.folder ?? '')
  if (!isExportFolder(folder)) throw httpError(400, 'unknown export folder')
  const still = String(b.still ?? '')
  if (!isStillId(still)) throw httpError(400, 'still must name an existing still')
  const seed = Number(b.seed)
  if (!Number.isInteger(seed) || seed < 0 || seed > 2 ** 48) throw httpError(400, 'seed must be a non-negative integer')
  return { folder, still, seed }
}

export function parseFinishRequest(body: unknown): FinishRequest {
  if (!body || typeof body !== 'object') throw httpError(400, 'body must be a JSON object')
  const b = body as Record<string, unknown>
  const folder = String(b.folder ?? '')
  if (!isExportFolder(folder)) throw httpError(400, 'unknown export folder')
  const source = String(b.source ?? '')
  if (!isStillId(source) && !(isLookId(source) && source.startsWith('grade-'))) throw httpError(400, 'source must be a still or a grade of it')
  const preset = b.preset as FinishPreset
  if (!PRESETS.includes(preset)) throw httpError(400, 'preset must be off, subtle or film')
  const toneMatch = b.toneMatch === true
  const dof = parseDof(b.dof)
  if (preset === 'off' && !toneMatch && !dof) throw httpError(400, 'nothing to do: preset off, no tone match, no depth of field')
  return { folder, source, preset, toneMatch, ...(dof ? { dof } : {}) }
}

/** The DoF option: absent/null = none. f-stop to 0.1 and focus to 1 cm, so the result's id names exactly what ran. */
export function parseDof(v: unknown): FinishDof | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'object') throw httpError(400, 'dof must be an object')
  const o = v as Record<string, unknown>
  const format = o.format as DofFormat
  if (!DOF_FORMATS.includes(format)) throw httpError(400, 'dof.format must be ff, lf or s35')
  const fNumber = Math.round(Number(o.fNumber) * 10) / 10
  if (typeof o.fNumber !== 'number' || !(fNumber >= DOF_LIMITS.fMin && fNumber <= DOF_LIMITS.fMax)) {
    throw httpError(400, `dof.fNumber must be a number from ${DOF_LIMITS.fMin} to ${DOF_LIMITS.fMax}`)
  }
  const focusM = Math.round(Number(o.focusM) * 100) / 100
  if (typeof o.focusM !== 'number' || !(focusM >= DOF_LIMITS.focusMin && focusM <= DOF_LIMITS.focusMax)) {
    throw httpError(400, `dof.focusM must be metres from ${DOF_LIMITS.focusMin} to ${DOF_LIMITS.focusMax}`)
  }
  return { format, fNumber, focusM }
}

export { dofTag } from './dof-tag.ts'

/**
 * Grades per server process. One grade is one Qwen Image Edit 2511 quality edit (20 steps, CFG 4, 1 MP, the still's
 * reference latent, up to two references seen as context): measured 10 credits (4.9 cents) with one reference, so 10
 * bounds a runaway session at ~100 credits (~50 cents).
 * Grading is deliberate (the one still per shot that becomes the first frame), not exploratory like Take still
 * (cap 20); 10 matches the Location cap.
 */
export const DEFAULT_LOOK_CAP = 10

/** Cap from env (CANVAS_LOOK_CAP): a positive integer, else the default. 0 or garbage never means "unlimited". */
export function lookCapFromEnv(raw: string | undefined): number {
  const n = Number(raw)
  return raw !== undefined && raw.trim() !== '' && Number.isInteger(n) && n > 0 ? n : DEFAULT_LOOK_CAP
}

/** Counted at submit time, never decremented (the stills cap, reused: 429 {"error":"cap"} at the cap). */
export class LookCap extends StillCap {}

/** Unique, sortable, filename-safe id: "grade-2026-10-18T19-40-10-123". */
export function newLookId(kind: 'grade' | 'finish', now = new Date()): string {
  return `${kind}-${now.toISOString().replace(/[:.]/g, '-').replace(/Z$/, '')}`
}

/** Per-still grain seed: FNV-1a of the still id, so the same still always gets the same grain. */
export function grainSeed(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0
  return h
}

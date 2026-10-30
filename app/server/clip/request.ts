/**
 * Validating a POST /__lab/clip body, the clip cap and ids. Pure, so it is unit-tested; the runner does the I/O.
 */
import { parseDof } from '../look/request.ts'
import type { FinishPreset } from '../look/types.ts'
import { isExportFolder } from '../stills/exports.ts'
import { StillCap } from '../stills/request.ts'
import { STRENGTH } from './spec.ts'
import type { ClipFinishRequest, ClipGrain, ClipRequest, ClipUpscale } from './types.ts'

/** An Error carrying the HTTP status the plugin answers with. */
export const httpError = (status: number, message: string) => Object.assign(new Error(message), { status })

const FOLDER_RE = /^video-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/
const FIRST_RE = /^([\w-]+)\/(stills\/(?:render|characters)-[\dT-]+|looks\/(?:grade|finish)-[\w-]+)\.png$/
const MAX_PROMPT = 4000
const CLIP_ID_RE = /^clip-[\dT-]+$/
const PRESETS: FinishPreset[] = ['off', 'subtle', 'film']
const GRAINS: ClipGrain[] = ['off', 'fine', 'heavy']

/** A clip folder the lab wrote (also the path-safety check for requests). */
export const isClipFolder = (name: string) => FOLDER_RE.test(name)

/** The export folder a first-frame path belongs to, or null when it is not a still / grade / finish PNG of an export. */
export function firstFrameExport(first: string): string | null {
  const m = FIRST_RE.exec(first)
  return m && isExportFolder(m[1]) && !first.includes('..') ? m[1] : null
}

export function parseClipRequest(body: unknown): ClipRequest {
  if (!body || typeof body !== 'object') throw httpError(400, 'body must be a JSON object')
  const b = body as Record<string, unknown>
  const folder = String(b.folder ?? '')
  if (!isClipFolder(folder)) throw httpError(400, 'unknown clip folder')
  const first = String(b.first ?? '')
  if (!firstFrameExport(first)) throw httpError(400, 'first must be a still, or a grade / finish of one')
  const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : ''
  if (!prompt) throw httpError(400, 'prompt is empty')
  if (prompt.length > MAX_PROMPT) throw httpError(400, `prompt longer than ${MAX_PROMPT} characters`)
  const strength = b.strength === undefined ? STRENGTH.default : Number(b.strength)
  if (!Number.isFinite(strength) || strength < STRENGTH.min || strength > STRENGTH.max) {
    throw httpError(400, `guide strength must be ${STRENGTH.min}-${STRENGTH.max}`)
  }
  const upscale = (b.upscale ?? 'off') as ClipUpscale
  if (upscale !== 'off' && upscale !== 'x2') throw httpError(400, 'upscale must be off or x2')
  const seed = Number(b.seed)
  if (!Number.isInteger(seed) || seed < 0 || seed > 2 ** 48) throw httpError(400, 'seed must be a non-negative integer')
  return { folder, first, prompt, strength, upscale, seed }
}

/** POST /__lab/clip/finish: the Look finish's validation (presets, parseDof), on a clip instead of a still, + grain. */
export function parseClipFinishRequest(body: unknown): ClipFinishRequest {
  if (!body || typeof body !== 'object') throw httpError(400, 'body must be a JSON object')
  const b = body as Record<string, unknown>
  const folder = String(b.folder ?? '')
  if (!isClipFolder(folder)) throw httpError(400, 'unknown clip folder')
  const clip = String(b.clip ?? '')
  if (!CLIP_ID_RE.test(clip)) throw httpError(400, 'clip must name a clip of that folder')
  const preset = b.preset as FinishPreset
  if (!PRESETS.includes(preset)) throw httpError(400, 'preset must be off, subtle or film')
  const grain = (b.grain ?? 'fine') as ClipGrain
  if (!GRAINS.includes(grain)) throw httpError(400, 'grain must be off, fine or heavy')
  const dof = parseDof(b.dof)
  if (preset === 'off' && !dof) throw httpError(400, 'nothing to do: preset off and no depth of field')
  return { folder, clip, preset, grain: preset === 'off' ? 'off' : grain, ...(dof ? { dof } : {}) }
}

/**
 * Clips per server process. One clip is one LTX-2.5 job: ≈2 credits for 3 s at 768×448, ≈3 for the longest (5 s);
 * with the x2 upscale ≈8 for 3 s, ≈13 for 5 s. A clip is deliberate (a take, a still approved at its start), not
 * exploratory, so 10 — like Look and Location — bounds a runaway session at ≈130 credits (≈62 cents) worst case.
 */
export const DEFAULT_CLIP_CAP = 10

/** Cap from env (CANVAS_CLIP_CAP): a positive integer, else the default. 0 or garbage never means "unlimited". */
export function clipCapFromEnv(raw: string | undefined): number {
  const n = Number(raw)
  return raw !== undefined && raw.trim() !== '' && Number.isInteger(n) && n > 0 ? n : DEFAULT_CLIP_CAP
}

/**
 * Counted at submit time (the stills cap, reused: 429 {"error":"cap"} at the cap). One slot is given back only for an
 * attempt known to have cost nothing: Cloud's model-load hiccup settled at a 0 balance delta (run.ts, O-04). A billed
 * or unknown outcome keeps its slot.
 */
export class ClipCap extends StillCap {
  refund(): void {
    if (this.count > 0) this.count--
  }
}

/** Unique, sortable, filename-safe id: "clip-2026-10-18T19-40-10-123". */
export function newClipId(now = new Date()): string {
  return `clip-${now.toISOString().replace(/[:.]/g, '-').replace(/Z$/, '')}`
}

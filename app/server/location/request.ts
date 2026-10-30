/**
 * Location request validation, ids and the per-process spend cap. Pure, unit-tested.
 *   POST /__lab/location/candidates  {"prompt": "...", "description": "...", "framing": FRAMING_KEYS, "light": LIGHT_KEYS, "lens": LENS_KEYS}
 *        prompt = the exact text to render (as shown in the lab, hand edits included); the rest is its provenance
 *   POST /__lab/location/pick        {"batch": "batch-<stamp>", "index": 0..3}
 */
import { RequestError } from '../settle/request.ts'
import { CANDIDATES } from './graph.ts'
import { FRAMING_KEYS, LENS_KEYS, LIGHT_KEYS, MAX_DESCRIPTION, MAX_PROMPT, tidyDescription } from './prompts.ts'
import type { CandidatesRequest, Framing, Lens, Light, PickRequest } from './types.ts'

export { RequestError }

const STAMP = '\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}'
/** Also the path-safety checks: an id is a folder name under public/lab-assets/locations/. */
export const BATCH_RE = new RegExp(`^batch-${STAMP}$`)
export const LOCATION_RE = new RegExp(`^loc-${STAMP}$`)

const stamp = (now: Date) => now.toISOString().replace(/[:.]/g, '-').replace(/Z$/, '')
export const newBatchId = (now = new Date()) => `batch-${stamp(now)}`
export const newLocationId = (now = new Date()) => `loc-${stamp(now)}`

const isObject = (b: unknown): b is Record<string, unknown> => !!b && typeof b === 'object' && !Array.isArray(b)

export function parseCandidatesRequest(body: unknown): CandidatesRequest {
  if (!isObject(body)) throw new RequestError(400, 'body must be a JSON object')
  const description = tidyDescription(typeof body.description === 'string' ? body.description : '')
  if (!description) throw new RequestError(400, 'describe the location first')
  if (description.length > MAX_DESCRIPTION) throw new RequestError(400, `description longer than ${MAX_DESCRIPTION} characters`)
  if (!FRAMING_KEYS.includes(body.framing as Framing)) throw new RequestError(400, `framing must be one of ${FRAMING_KEYS.join(', ')}`)
  if (!LIGHT_KEYS.includes(body.light as Light)) throw new RequestError(400, `light must be one of ${LIGHT_KEYS.join(', ')}`)
  if (!LENS_KEYS.includes(body.lens as Lens)) throw new RequestError(400, `lens must be one of ${LENS_KEYS.join(', ')}`)
  // the prompt is rendered and stored exactly as sent: checked, never rewritten
  const prompt = typeof body.prompt === 'string' ? body.prompt : ''
  if (!prompt.trim()) throw new RequestError(400, 'the prompt is empty')
  if (prompt.length > MAX_PROMPT) throw new RequestError(400, `prompt longer than ${MAX_PROMPT} characters`)
  return { prompt, description, framing: body.framing as Framing, light: body.light as Light, lens: body.lens as Lens }
}

export function parsePickRequest(body: unknown): PickRequest {
  if (!isObject(body)) throw new RequestError(400, 'body must be a JSON object')
  if (typeof body.batch !== 'string' || !BATCH_RE.test(body.batch)) throw new RequestError(400, 'batch must be a candidate batch id')
  const index = body.index
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= CANDIDATES) {
    throw new RequestError(400, `index must be 0-${CANDIDATES - 1}`)
  }
  return { batch: body.batch, index, ...(body.build === false ? { build: false } : {}) }
}

/** Distinct random seeds for one batch (recorded per candidate, so each still can be re-rendered on its own). */
export function newSeeds(n = CANDIDATES, rand = Math.random): number[] {
  const seeds = new Set<number>()
  while (seeds.size < n) seeds.add(Math.floor(rand() * 2 ** 31))
  return [...seeds]
}

/**
 * Jobs per server process. One location costs two jobs: the candidates (4 Z-Image Turbo stills, ≈ 4-8 credits) and
 * the master's depth (MoGe-2, ≈ 1). 10 jobs = five locations, or a few re-rolled descriptions, ≈ 50-80 credits at
 * worst before a restart is needed. Lower than the stills/settle caps (20) because one candidates job is four stills.
 */
export const DEFAULT_LOCATION_CAP = 10

/** Cap from env (CANVAS_LOCATION_CAP): a positive integer, else the default. 0 or garbage never means "unlimited". */
export function locationCapFromEnv(raw: string | undefined): number {
  const n = Number(raw)
  return raw !== undefined && raw.trim() !== '' && Number.isInteger(n) && n > 0 ? n : DEFAULT_LOCATION_CAP
}

/**
 * Location jobs this process may submit. Counted at submit time (a submitted job is billed whether or not it
 * succeeds), never decremented; the client is not trusted to stop itself.
 */
export class LocationCap {
  count = 0
  readonly cap: number
  constructor(cap: number) {
    this.cap = cap
  }
  get reached(): boolean {
    return this.count >= this.cap
  }
  /** Take one slot or refuse with 429. */
  take(): void {
    if (this.reached) throw new RequestError(429, 'cap')
    this.count++
  }
}

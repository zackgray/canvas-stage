/**
 * Settle request validation and the per-process spend cap. Pure, unit-tested.
 *   POST /__lab/settle  {"export": "view-<stamp>", "model": "klein" | "qwen"}
 */
import { MODELS, type SettleModel } from './graph.ts'

export interface SettleRequest {
  export: string
  model: SettleModel
}

export interface SettleResponse {
  export: string
  /** folder relative to /lab-assets/renders/, loadable by the lab's loadSettledView */
  settled: string
  scale: number
  shift: number
  rmsMetres: number
  /** fractions of the frame: holes in the export, holes still without depth (sky excluded), sky inside the holes */
  holesBefore: number
  holesAfter: number
  skyFraction: number
  /** balance delta right after the job, ≈ credits; null when the balance could not be read */
  credits: number | null
  seconds: number
}

export interface SettleStatus {
  busy: boolean
  phase: string
  count: number
  cap: number
}

export const DEFAULT_CAP = 20
/** Only single-view exports from the projection lab: "view-YYYY-MM-DDTHH-MM-SS". Also the path-safety check. */
export const VIEW_RE = /^view-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/

export class RequestError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function parseSettleRequest(body: unknown): SettleRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestError(400, 'body must be a JSON object')
  const b = body as Record<string, unknown>
  if (typeof b.export !== 'string' || !VIEW_RE.test(b.export)) throw new RequestError(400, 'export must be a view folder name like "view-2026-10-17T20-08-31"')
  if (typeof b.model !== 'string' || !MODELS.includes(b.model as SettleModel)) throw new RequestError(400, `model must be one of ${MODELS.join(', ')}`)
  return { export: b.export, model: b.model as SettleModel }
}

/** Cap from env: a positive integer, else the default. 0 or garbage never means "unlimited". */
export function capFromEnv(raw: string | undefined): number {
  const n = Number(raw)
  return raw !== undefined && raw.trim() !== '' && Number.isInteger(n) && n > 0 ? n : DEFAULT_CAP
}

/**
 * Settles this server process may submit. Counted at submit time (a submitted job is billed whether or not it
 * succeeds), never decremented; the client's own cap is not trusted.
 */
export class SettleCap {
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

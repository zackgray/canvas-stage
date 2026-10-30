/**
 * Validating a POST /__lab/still body and planning the job it implies (which files go in, which instruction,
 * which graph variant). Pure, so it is unit-tested; the runner does the I/O.
 */
import { isExportFolder } from './exports.ts'
import { checkRepaint, LOCK } from './graph-lock.ts'
import { charactersInstruction, holesInstruction, lockPrompt, renderInstruction, tidy } from './prompts.ts'
import type { StillMode, StillRecord, StillRequest, StillVariant } from './types.ts'

const MAX_TEXT = 2000
const ID_RE = /^(render|characters)-[\dT-]+$/

export function isStillId(id: string): boolean {
  return ID_RE.test(id)
}

/** Throws a user-readable Error on anything malformed. */
export function parseRequest(body: unknown): StillRequest {
  if (!body || typeof body !== 'object') throw new Error('body must be a JSON object')
  const b = body as Record<string, unknown>
  const kind = b.kind
  if (kind !== 'render' && kind !== 'characters') throw new Error('kind must be "render" or "characters"')
  const folder = String(b.folder ?? '')
  if (!isExportFolder(folder)) throw new Error('unknown export folder')
  const mode: StillMode = b.mode === 'fast' ? 'fast' : 'quality'
  const seed = Number(b.seed)
  if (!Number.isInteger(seed) || seed < 0 || seed > 2 ** 48) throw new Error('seed must be a non-negative integer')
  const text = (v: unknown) => {
    const s = tidy(typeof v === 'string' ? v : '')
    if (s.length > MAX_TEXT) throw new Error(`text longer than ${MAX_TEXT} characters`)
    return s
  }
  // Repaint (the lock pass's denoise) exists only on a Quality structure-locked render; defaulted there, refused elsewhere
  const variant: StillVariant = b.variant === 'holes' || b.variant === 'full' ? b.variant : 'locked'
  const repaintApplies = kind === 'render' && variant === 'locked' && mode === 'quality'
  if (b.repaint !== undefined && !repaintApplies) throw new Error('repaint applies to Quality structure-locked stills only')
  if (kind === 'render') {
    const scenePrompt = text(b.scenePrompt)
    if (!repaintApplies) return { kind, folder, mode, seed, variant, scenePrompt }
    return { kind, folder, mode, seed, variant, scenePrompt, repaint: b.repaint === undefined ? LOCK.combo.denoise : checkRepaint(b.repaint) }
  }
  const parentId = String(b.parentId ?? '')
  if (!isStillId(parentId)) throw new Error('parentId must name an existing still')
  const direction = text(b.direction)
  if (!direction) throw new Error('direction is empty')
  return { kind, folder, mode, seed, parentId, direction }
}

export interface JobPlan {
  variant: StillVariant
  prompt: string
  /** paths relative to the renders dir */
  input: string
  mask: string | null
  /** renders-relative 16-bit depth (structure-locked only) */
  depth?: string
  /** structure-locked: the Z-Image prompt (`prompt` is then the Qwen holes instruction, used in quality mode) */
  lockPrompt?: string
  /** human label for the ledger */
  workflow: string
}

/**
 * `colorFile`/`maskFile` are the export's files (renders-relative); `parent` is the still being edited.
 * Characters always edit the whole frame of the parent still.
 */
export function planJob(
  req: StillRequest,
  exp: { color: string; mask: string | null; depth?: string | null },
  parent?: StillRecord,
): JobPlan {
  if (req.kind === 'characters') {
    if (!parent) throw new Error('parent still not found')
    if (parent.folder !== req.folder) throw new Error('parent still belongs to another export')
    return {
      variant: 'full', prompt: charactersInstruction(req.direction ?? ''),
      input: `${req.folder}/stills/${parent.id}.png`, mask: null,
      workflow: `still_qwen-edit (characters, ${req.mode})`,
    }
  }
  if (req.variant === 'locked') {
    if (!exp.mask || !exp.depth) throw new Error('structure-locked needs the export’s hole mask and depth — re-export the view, or use Free re-render')
    return {
      variant: 'locked', prompt: holesInstruction(req.scenePrompt, true), lockPrompt: lockPrompt(req.scenePrompt),
      input: `${req.folder}/${exp.color}`, mask: `${req.folder}/${exp.mask}`, depth: `${req.folder}/${exp.depth}`,
      workflow: req.mode === 'fast' ? 'still_zimage-locked (render, fast)' : 'still_lock-combo (render, quality: Qwen holes + Z-Image locked)',
    }
  }
  if (req.variant === 'holes') {
    if (!exp.mask) throw new Error('this export has no hole mask')
    return {
      variant: 'holes', prompt: holesInstruction(req.scenePrompt), input: `${req.folder}/${exp.color}`,
      mask: `${req.folder}/${exp.mask}`, workflow: `still_qwen-holes (render, ${req.mode})`,
    }
  }
  return {
    variant: 'full', prompt: renderInstruction(req.scenePrompt), input: `${req.folder}/${exp.color}`, mask: null,
    workflow: `still_qwen-edit (render, ${req.mode})`,
  }
}

export const DEFAULT_STILL_CAP = 20

/** Cap from env (CANVAS_STILL_CAP): a positive integer, else the default. 0 or garbage never means "unlimited". */
export function stillCapFromEnv(raw: string | undefined): number {
  const n = Number(raw)
  return raw !== undefined && raw.trim() !== '' && Number.isInteger(n) && n > 0 ? n : DEFAULT_STILL_CAP
}

/**
 * Stills this server process may submit. Counted at submit time (a submitted job is billed whether or not it
 * succeeds), never decremented; the client is not trusted to stop itself.
 */
export class StillCap {
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
    if (this.reached) throw capError()
    this.count++
  }
}
export const capError = () => Object.assign(new Error('cap'), { status: 429 })

/** Unique, sortable, filename-safe id: "<kind>-2026-10-17T19-40-10-123". */
export function newStillId(kind: StillRequest['kind'], now = new Date()): string {
  return `${kind}-${now.toISOString().replace(/[:.]/g, '-').replace(/Z$/, '')}`
}

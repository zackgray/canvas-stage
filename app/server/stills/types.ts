/**
 * Wire types shared by the Stills lab (browser) and its dev-only middleware (server). Types only — no runtime
 * code, so importing them from browser code pulls in nothing server-side.
 */

/** "render": stage view -> photoreal still. "characters": instruction edit on an earlier still. */
export type StillKind = 'render' | 'characters'
/**
 * "locked": structure-locked (default) — the stage depth steers a partial-denoise re-render so the composition
 *   cannot move (quality: Qwen holes fill, then a Z-Image depth-locked finish; fast: the Z-Image pass alone).
 * "full": free re-render — Qwen re-renders the whole frame from the colour view only; may change composition.
 * "holes": crop-and-stitch, only the hole mask is repainted.
 */
export type StillVariant = 'locked' | 'full' | 'holes'
/** Qwen: "quality" full model, 20 steps, CFG 4; "fast" Lightning 4-step LoRA, CFG 1. For "locked" see above. */
export type StillMode = 'quality' | 'fast'

export interface StillRequest {
  kind: StillKind
  /** export folder under /lab-assets/renders/ */
  folder: string
  mode: StillMode
  seed: number
  /** kind "render" */
  variant?: StillVariant
  scenePrompt?: string
  /** Quality structure-locked only: the lock pass's denoise ("Repaint"), 0.4-0.6; the server defaults it to 0.55 */
  repaint?: number
  /** kind "characters": id of the still to edit, and the direction text */
  parentId?: string
  direction?: string
}

export interface StillRecord {
  id: string
  folder: string
  kind: StillKind
  variant: StillVariant
  mode: StillMode
  seed: number
  /** the exact instruction sent to Qwen */
  prompt: string
  scenePrompt?: string
  direction?: string
  parentId?: string
  /** URL of the image fed in (export colour view, or the parent still) */
  input: string
  /** URL of the result */
  output: string
  /** Quality structure-locked: the lock pass's denoise it ran at (absent on older records: 0.4) */
  repaint?: number
  /** Quality structure-locked: URL of the Qwen holes fill the locked pass started from */
  fill?: string
  jobId: string
  wallSeconds: number
  execSeconds: number | null
  /** balance delta across the job; null until settled or when the balance is unreadable */
  costCents: number | null
  credits: number | null
  /** true once the delayed balance re-read has happened */
  costSettled: boolean
  createdAt: string
}

export interface ExportEntry {
  folder: string
  kind: 'view' | 'clip'
  color: string
  mask: string | null
  /** 16-bit near-bright depth of the colour view (needed by the structure-locked render) */
  depth: string | null
  width: number | null
  height: number | null
  holeFraction: number | null
  source: string | null
  /** prompt of the bank shot the export was projected from, when the manifests have it */
  sourcePrompt: string | null
  createdAt: string
  results: StillRecord[]
}

export interface StillsListing {
  exports: ExportEntry[]
  /** a job (or its cost settle) is in progress; a new submit would be refused */
  busy: boolean
  phase: string | null
  /** stills this server process has submitted, and its cap (CANVAS_STILL_CAP); at the cap every POST is a 429 */
  count: number
  cap: number
  /** false when no Comfy target is configured (no key and no COMFY_BASE_URL) */
  configured: boolean
}

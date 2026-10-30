/**
 * Scene design contract: the routes Scene uses before a world exists. Concept candidates (paid, Qwen-Image 2512 text-to-image)
 * for the look pieces and the extras sheet, the draft design saved per project as you go, uploaded references, and the draft's
 * move into the world's Bible at Build the set. Server: server/scene/. Fields are only ever added. Pure (no DOM, no node).
 */

export const SCENE_ROUTES = { scene: '/__lab/scene' } as const
/**
 * GET  /__lab/scene/concepts                -> ConceptStatus (prices, a draw in flight, billed draws to recover)
 * GET  /__lab/scene/concepts/run?id=<runId> -> ConceptResponse (completes a draw recovered by id, free)
 * POST /__lab/scene/concepts                ConceptRequest -> ConceptResponse (paid)
 *   400 bad input, 409 busy, 429 day budget, 503 no Comfy target: refused before any spend. 502 + jobId (+ runId) = recover by id
 *   (POST /__lab/jobs/recover), then GET /concepts/run?id=<runId>; never resend.
 * GET  /__lab/scene/draft?project=<id>      -> DraftResponse (draft null = none)
 * POST /__lab/scene/draft                   DraftSaveRequest -> DraftResponse (free; replaces the draft; 409 {error, revision} when stale)
 * POST /__lab/scene/upload?project=<id>&name=<file name>   raw image body (png / jpeg / webp, UPLOAD_LIMIT bytes) -> UploadResponse
 * POST /__lab/scene/draft/migrate           DraftMigrateRequest -> DraftMigrateResponse (free; the draft's files copied into the Bible)
 * <project> is a library scene id (libraryContract.ts): each scene has its own draft.
 */

/** the look pieces Scene draws as concept images (people and creatures are Cast fronts) */
export const CONCEPT_KINDS = ['location', 'mood', 'lighting', 'material', 'prop', 'beat', 'group'] as const
export type ConceptKind = (typeof CONCEPT_KINDS)[number]
export const isConceptKind = (v: unknown): v is ConceptKind => typeof v === 'string' && (CONCEPT_KINDS as readonly string[]).includes(v)

/** 'full' = Qwen-Image 2512 at 50 steps (the template); 'draft' = the Lightning 4-step LoRA (E125 mood boards) */
export type ConceptQuality = 'full' | 'draft'
/** credits for ONE image, re-based 2026-10-28 from the app's billed concept jobs (server/priceBasis.ts): full x1 billed 16 -> 17;
 *  draft x1 billed 0.8 warm / 4-6 cold -> 6. A press bills mostly its cold start, so each further image adds far less (CONCEPT_MORE). */
export const CONCEPT_CR: Record<ConceptQuality, number> = { full: 17, draft: 6 }
/** credits for each image after the first in one press: full x2 billed 28-29 (about 13 more), draft x2 billed 5 and x4 billed 3 (about 0-1 more) */
export const CONCEPT_MORE: Record<ConceptQuality, number> = { full: 14, draft: 1 }
export const CONCEPT_MAX = 4
export const conceptCredits = (quality: ConceptQuality, n: number) => CONCEPT_CR[quality] + CONCEPT_MORE[quality] * (Math.max(1, n) - 1)
export const CONCEPT_INPUT = { description: 1200, name: 80, line: 400 } as const

/** (prop-draw-parts) a prop draw's editable parts, each replacing the app's default for that part when set ('' leaves it out):
 *  the view, how the picture is taken (the product-photo setup), the light and the rules. Unset = the default, as ever. */
export interface PropParts { view?: string; setup?: string; light?: string; rules?: string }
export const PROP_PARTS = ['view', 'setup', 'light', 'rules'] as const

export interface ConceptRequest {
  kind: ConceptKind
  /** the piece's words (its look line, or its name when it has none) */
  description: string
  name?: string
  /** the scene's lighting and materials lines, so every concept sits in the same light */
  lighting?: string
  materials?: string
  /** a prop draw's edited parts (unset = the defaults) */
  parts?: PropParts
  /** 1..CONCEPT_MAX images in one job */
  count: number
  quality: ConceptQuality
  project?: string
  seed?: number
}
export interface ConceptResponse {
  runId: string
  kind: ConceptKind
  quality: ConceptQuality
  /** public URLs, one per image */
  urls: string[]
  jobId: string | null
  /** measured (null = not measured) */
  credits: number | null
  estimate: number
  prompt: string
  createdAt: string
}
export interface ConceptStatus {
  prices: Record<ConceptQuality, number>
  max: number
  running: { since: string; what: string } | null
  /** billed concept jobs whose images never landed: recover by id (free), then GET /concepts/run?id= */
  unrecovered: { jobId: string; runId: string; since: string }[]
}

// ---------------------------------------------------------------- the draft design (before a world exists)

/** an uploaded reference: png, jpeg or webp, at most this many bytes */
export const UPLOAD_LIMIT = 12 * 1024 * 1024
export const UPLOAD_TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' } as const
export type UploadExt = keyof typeof UPLOAD_TYPES
/** the draft design JSON, at most this many bytes */
export const DRAFT_LIMIT = 512 * 1024

/** The design as Scene keeps it. Opaque to the server apart from the URLs it moves at migrate. */
export type DraftDesign = Record<string, unknown>
/** `revision`: 1, 2, 3 … per save (absent on drafts written before revisions: read as 0) */
export interface DraftRecord { project: string; design: DraftDesign; updatedAt: string; revision?: number }
export interface DraftResponse { draft: DraftRecord | null }
/** `revision`: the draft's revision when the page read it (0 when there was none); a stale one is refused with 409 {error, revision} */
export interface DraftSaveRequest { project: string; design: DraftDesign; revision: number }
export interface UploadResponse { url: string; bytes: number; type: string }
export interface DraftMigrateRequest { project: string; worldId: string }
/** `moved`: old URL -> its copy under the world's bible/elements/; the draft is gone from the project afterwards */
export interface DraftMigrateResponse { worldId: string; moved: Record<string, string>; design: DraftDesign | null }

/** under the app's public/: lab-assets/scene/<project>/{draft/design.json, draft/refs/…, concepts/<runId>/…} */
export const scenePaths = (project: string) => {
  const root = `lab-assets/scene/${project}`
  return { root, draft: `${root}/draft`, file: `${root}/draft/design.json`, refs: `${root}/draft/refs`, concepts: `${root}/concepts` }
}

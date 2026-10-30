/**
 * Wire types of the Look endpoint (server/look/plugin.ts), shared with the browser client
 * (src/labs/projection/look/api.ts). Types only, so the browser bundle pulls in nothing server-side.
 */

export type TimeOfDay = 'dawn' | 'day' | 'golden' | 'blue' | 'night'
export type Atmosphere = 'none' | 'haze' | 'fog'
/** Deterministic finish strength: off (tone-match only, if asked), subtle (half E14), film (E14's winner). */
export type FinishPreset = 'off' | 'subtle' | 'film'

/** Per-location look, stored as public/lab-assets/looks/<shot key>/look.json (+ ref-1 / ref-2 images). */
export interface LookSettings {
  /** the shot id as the lab names it ("loc-2026-…", "wide", "e2/wide") */
  shot: string
  /** short free text, e.g. "wet, quiet, sodium-lit" */
  mood: string
  /** null = keep the still's own time of day */
  timeOfDay: TimeOfDay | null
  /** none = leave the air as it is */
  atmosphere: Atmosphere
  /** up to 2 reference image URLs (JPEG/PNG) under /lab-assets/looks/ */
  references: string[]
  updatedAt: string | null
}

export type LookSettingsPatch = Pick<LookSettings, 'shot' | 'mood' | 'timeOfDay' | 'atmosphere'>

/** POST /__lab/look/grade: one Cloud job relighting one still of an export. */
export interface GradeRequest {
  folder: string
  /** id of the still (server/stills record) to grade */
  still: string
  seed: number
}

/** Sensor format of the viewport's DoF (math/dof.ts SENSOR_FORMATS ids). */
export type DofFormat = 'ff' | 'lf' | 's35'

/** Depth of field on a finish: the viewport's lens (format, f-stop) focused at `focusM` metres (planar). */
export interface FinishDof {
  format: DofFormat
  fNumber: number
  focusM: number
}

/** POST /__lab/look/finish: local, free. `source` is the still id or a grade id of that still. */
export interface FinishRequest {
  folder: string
  source: string
  preset: FinishPreset
  /** match tones to the location's master still (per-channel percentile curve) */
  toneMatch: boolean
  /** blur by the export's depth map before the finish (server/look/dof.ts); absent = no DoF */
  dof?: FinishDof
}

export interface LookRecord {
  id: string
  kind: 'grade' | 'finish'
  folder: string
  /** the original still this version descends from */
  still: string
  /** what was fed in: the still id, or (finish) a grade id */
  source: string
  /** URLs of the input and the result (a new file; the original is never overwritten) */
  input: string
  output: string
  /** the location the export was shot in, when known */
  shot: string | null
  createdAt: string
  /** grade: the exact instruction, references used, the look it was made with, and the job */
  prompt?: string
  references?: string[]
  timeOfDay?: TimeOfDay | null
  atmosphere?: Atmosphere
  mood?: string
  seed?: number
  /** grade: the sampler's denoise (1 = from noise; below 1 the sample starts from the still) */
  denoise?: number
  jobId?: string
  wallSeconds?: number
  execSeconds?: number | null
  costCents?: number | null
  credits?: number | null
  costSettled?: boolean
  /** grade: edge correlation of the result with the still (1 = same edges) */
  edgeCorr?: number
  /** grade: false when edgeCorr is under the guard's floor (guard.ts): re-composed, kept on disk, never applied */
  kept?: boolean
  /** finish */
  preset?: FinishPreset
  toneMatch?: boolean
  /** finish with DoF: the lens asked for, the focal length it came to on the export camera, the largest blur (px) */
  dof?: FinishDof & { focalMm: number; maxRadiusPx: number }
}

export interface LookStatus {
  busy: boolean
  phase: string
  /** grades this server process has submitted, and its cap (CANVAS_LOOK_CAP); at the cap every grade POST is a 429 */
  count: number
  cap: number
  configured: boolean
  lastError: string | null
  /** every grade / finish on disk, oldest first */
  results: LookRecord[]
}

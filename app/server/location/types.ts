/**
 * Contract of the Location endpoint (server/location/plugin.ts), shared with the browser client
 * (src/labs/projection/location/api.ts). Types only, so the browser bundle pulls in nothing server-side.
 */

/** Framing presets (prompts.ts FRAMINGS). Batches made before E18 may still carry 'three-quarter'. */
export type Framing = 'wide' | 'along' | 'low-angle'
export type Light = 'golden' | 'overcast' | 'night' | 'blue-hour' | 'firelight' | 'dusk' | 'moonlit'
export type Lens = '24-portra' | '28-cinestill' | '35-fuji'

/** The structured form the prompt is assembled from (prompts.ts locationPrompt). */
export interface PromptForm {
  /** the location in words, e.g. "a Renaissance-style bank in London at sunset. Fluted stone columns, …" */
  description: string
  framing: Framing
  light: Light
  lens: Lens
}

export interface CandidatesRequest extends PromptForm {
  /** the exact text every candidate is rendered from: the assembled prompt as shown, possibly edited by hand */
  prompt: string
}

export interface PickRequest {
  /** a CandidateBatch id */
  batch: string
  /** which candidate, 0-based */
  index: number
  /** false = register only; the world build is the owner's own paid press (the studio; review F3). Default: auto-start */
  build?: boolean
}

export interface Candidate {
  index: number
  seed: number
  /** URL under /lab-assets/locations/ */
  image: string
}

/** One Cloud job: N Z-Image Turbo stills of one prompt, one seed each. */
export interface CandidateBatch {
  id: string
  description: string
  framing: Framing
  light?: Light
  lens?: Lens
  /** the exact prompt every candidate was rendered from (as shown in the lab and posted) */
  prompt: string
  width: number
  height: number
  candidates: Candidate[]
  jobId: string
  createdAt: string
  /** candidate index -> location id, for every candidate already picked as a master (a re-pick costs nothing) */
  picks?: Record<string, string>
  /** a batch made from a frame of a footage take (footage-pick.ts): one candidate, never the contact sheet the lab shows */
  source?: { kind: 'footage'; take: string; frame: number }
}

/** A manifest shot as the projection lab reads it (engine/manifest.ts BankShot), plus where it came from. */
export interface LocationShot {
  id: string
  image: string
  width: number
  height: number
  prompt: string
  seed: number
  fovDeg: number
  metric: true
  skyMask: string
  depths: {
    model: string
    path: string
    convention: 'near-dark'
    bitDepth: 16
    metersPerUnit: number
    metric: true
    fovDeg: number
    note: string
  }[]
  description: string
  framing: Framing
  batch: string
  candidate: number
}

export interface PickResult {
  /** the new shot id in /lab-assets/locations/manifest.json */
  location: string
  shot: LocationShot
  /** R² of MoGe's 1/z fit against its own point map (1.0000 when the depth is sane) */
  r2: number
  jobId: string
}

export interface LocationStatus {
  busy: boolean
  phase: string
  /** jobs this server process has submitted, and its cap */
  count: number
  cap: number
  configured: boolean
  /** the latest candidate batch and the latest landed location (so a dropped POST is recovered by reading these) */
  batch: CandidateBatch | null
  last: PickResult | null
  /** why the last job failed, if it did */
  lastError: string | null
  /** what the world build that a NEW location auto-starts is checked against (the recipe's estimate; review F3) */
  worldBuildCredits?: number
}

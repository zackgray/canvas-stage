/** Shared shapes of the Surround step (docs/chain-contract.md "Surround"). Types and constants only: the browser imports this. */
import type { SurroundHiRes, WorldFields, WorldRecipe } from '../../src/shared/worldContract.ts'

/**
 * One 360 job, recipe e57-opt3+seam: two seeds in one graph (shared loaders), each generated (16 steps, CFG 4) AND seam-fixed
 * (KSampler 20 steps at denoise 0.8, CFG 4) in the same job. The day budget is checked against this; it is also the re-roll
 * price the panel shows. Credits track exec seconds at ~0.26 cr/s across credit-log.md. ComfyUI's KSampler runs ALL 20 steps
 * at denoise 0.8 (the schedule is lengthened, not shortened), so the seam is 2 seeds x 20 x 2 (CFG) = 80 evaluations, not
 * 64; the closest measured job (E57 opt 2: 80 evaluations, 2 VAE round trips) ran 63.9 s for 17 cr, and this graph adds the
 * generation half on top: a plausible 75-85 s exec = 20-22 cr. 24 until measured (docs/world-stage1-review.md F3).
 * REFIT ME: the first live run's batch record (`credits`) and its credit-log.md row give the real cost; set this to that
 * value x 1.2.
 */
export const SURROUND_CREDITS = 24
export const SURROUND_SEEDS = [1, 2] as const
/** The equirect the 360 LoRA was trained at (2:1). */
export const PANO_W = 2048
export const PANO_H = 1024
/** surround-dist.png: 16-bit, metres along the ray = value * distMetersPerUnit; 0 = sky. Farther is clamped to this. */
export const DIST_MAX_M = 1000

export type Vec3 = [number, number, number]

/** locations/<id>/level.json (written by scripts/location_level.py) */
export interface LocationLevel {
  up: Vec3
  cameraHeightM: number | null
  inliers: number
  method: 'floor-ransac' | 'assumed'
  vfovDeg: number
  samples: number
  assumedPitchDeg: number
  tiltFromAssumedDeg: number
  fitted: string
}

/**
 * The world's scale anchor and horizon (meta.json `world`, docs/world-first-audit.md §4), with the Wave A fields
 * (src/shared/worldContract.ts WorldFields: eyeHeightM, cameraPreset 'chest' 1.2 | 'eye' 1.6, recipe).
 */
export interface WorldMeta extends WorldFields {
  /** the camera height, metres: THE metric anchor (owner, 2026-10-21; MoGe's cameraHeightM is a readout only); editable
   *  (POST /__lab/surround/world), set from the preset (eye by default, chest for a low-angle framing) */
  eyeHeightM: number
  /** image row (pixel-centre convention, 0 = first row) of the horizon at the still's centre column, from level.json `up` and
   *  the lens; null without a lens */
  horizonRow: number | null
  /** when a surround was last picked for this world; null until then */
  builtAt: string | null
}

/**
 * meta.json `surround`, written LAST by a pick. The client builds the far layer from this plus the two pngs. Wave A adds
 * (SurroundHiRes): colourUrl / colourWidth / colourHeight (the 8192, or 4096, colour; distance + mesh stay at width) and
 * floor (the surround's own fitted ground) on pano-590011 picks.
 */
export interface SurroundMeta extends SurroundHiRes {
  url: string
  distUrl: string
  width: number
  height: number
  /** surround-dist.png: metres per 16-bit step */
  distMetersPerUnit: number
  /** the level frame the equirect is in (world up in the still's camera space) */
  up: Vec3
  levelMethod: 'floor-ransac' | 'assumed'
  /** no sky: the layer draws no dome and the far mesh is not cut */
  interior: boolean
  batch: string
  seed: number
  prompt: string
  /** the lighting line the user typed for this batch (null = none typed; absent on picks made before it was carried);
   *  Realism and Reskin read it (realism/cast.ts lightingOf) */
  lighting?: string | null
  scaleToStill: number
  residualMedianPct: number
  skyShare: number
  pickedAt: string
  /** the candidate id picked (<batch>-<seed>) */
  candidate?: string
  /** the batch's suggested candidate at pick time (null = no score) */
  suggested?: string | null
  /** how it was made: '<batch recipe>+match', e.g. 'e57-opt3+seam+match'; batches before the recipe read 'e46-lightning4+match';
   *  a pano-590011 pick reads 'pano-590011' (no match: the set is cut from the same picture) */
  recipe?: string
  /** the E57 global Lab colour match the pick ran (scripts/surround_match.py stats) */
  match?: Record<string, unknown>
}

export interface SurroundCandidate {
  id: string
  url: string
  seed: number
  /** the batch stamp it belongs to */
  batch?: string
  /** true when this picture already carries the E59 wrap-seam fix (recipe e57-opt3+seam); older batches are false */
  seamFixed?: boolean
  /** the seam-fixed picture (= `url` when seamFixed, else null) */
  seamUrl?: string | null
  /** border agreement with the still after the colour match (scripts/surround_score.py): lower is better; null = not scored */
  score?: number | null
  /** 'black' (Cloud's NaN fault) or 'flat' (near-constant): never suggested, never pickable (server/surround/blank.ts) */
  unusable?: 'black' | 'flat' | null
  /** the batch's recipe ('pano-590011' | 'e57-opt3+seam'; 'e46-lightning4' before the recipe was recorded): anything but
   *  pano-590011 is an OLD-recipe pair (label it) */
  recipe?: string
  /** what picking this seed costs now: 0 for an old recipe (local) or a pano seed whose upscale + master depth are cached
   *  (a swap back is free), else the upscale + MoGe estimate */
  pickCredits?: number
}

/**
 * The build stage the World screen's progress shows (A3), in order. One Cloud job holds generating · harmonising · seam (the
 * stage is estimated from elapsed time, `stageEstimated`); the pick runs upscaling · depth · floor (measured: the pick job
 * writes it as it goes). Old-recipe builds skip harmonising, and their picks skip upscaling.
 */
export type BuildStage = 'generating' | 'harmonising' | 'seam' | 'upscaling' | 'depth' | 'floor'
export const BUILD_STAGES: readonly BuildStage[] = ['generating', 'harmonising', 'seam', 'upscaling', 'depth', 'floor']

/**
 * Where the world build is. Mapping from the old vocabulary: 'generating' is unchanged, 'depth' is now 'picking'.
 *   generating · harmonising · seam   the ONE build job is running; which of its stages is estimated from the elapsed time
 *                  (`stageEstimated`); harmonising only for recipe pano-590011
 *   upscaling · depth · floor          a pano-590011 pick (its stages are written by the pick as it goes)
 *   ready-to-pick  the newest batch is on disk and none of it is picked yet
 *   picking        an old-recipe pick: the local colour match + wrap fix + pano depth is running
 *   picked         the world's surround is installed from the newest batch
 *   refused        the auto-start was refused before any spend (the day budget): see `autoStart.reason`
 *   failed         the last step failed (`lastError`, `depthJob.error` or `autoStart.reason` says why)
 *   null           nothing yet
 */
export type SurroundPhase = 'generating' | 'harmonising' | 'seam' | 'upscaling' | 'depth' | 'floor' | 'ready-to-pick' | 'picking' | 'picked' | 'refused' | 'failed'

/** locations/<id>/surround-auto.json: the surround a registration started (server/surround/auto.ts) */
export interface AutoStart {
  /** started = written at registration (`pending` while the location's cost settles) and while the job runs; queued =
   *  waiting for another location's surround job to end (it then starts by itself); skipped = that wait ran out, nothing
   *  spent. A started / queued whose `pid` is gone was interrupted (pending.ts). */
  status: 'started' | 'queued' | 'done' | 'refused' | 'failed' | 'skipped'
  /** why it was refused or failed, e.g. "budget: raise CANVAS_DAY_BUDGET (…)" */
  reason: string | null
  at: string
  /** the batch it made (status 'done') */
  batch: string | null
  /** the server process running it (started / queued) */
  pid?: number
  /** registered, the auto-start has not begun yet (the location's cost is still settling) */
  pending?: boolean
}
export interface Running { since: string; what: string; recordId?: string; jobId?: string }

/**
 * GET /__lab/surround/status (docs/chain-contract.md "Surround"). Fields are only ever added.
 * Wave 1 (world build) added: auto, autoStart, suggested, credits, rerollCredits, lighting, world, recipe, the candidates'
 * batch / seamFixed / seamUrl / score, surround.candidate, and the phase vocabulary above. This server ALWAYS sends every
 * one of them (except `suggested` when nothing was scored); they are typed optional only so status fixtures written before
 * the wave still type-check.
 */
export interface SurroundStatus {
  configured: boolean
  running: Running | null
  phase: SurroundPhase | null
  budget: { cap: number | null; spentToday: number; remaining: number | null }
  location: { id: string; interior: boolean | null }
  level: LocationLevel | null
  candidates: SurroundCandidate[]
  surround: { url: string; distUrl: string; pickedAt: string; candidate?: string } | null
  depthJob: { status: 'idle' | 'running' | 'done' | 'failed'; log: string[]; error: string | null }
  price: { credits: number; seeds: number }
  lastError: string | null
  /** batches whose Cloud job was submitted but whose pictures are not on disk: POST /__lab/jobs/recover {jobId} (never submits) */
  unrecovered: { jobId: string; batch: string; since: string }[]
  /** batches whose submit a restart cut off (no job id anywhere): a new build is refused until they are dealt with */
  interrupted?: { batch: string; since: string }[]
  /** the newest batch (or the newest refusal / failure) was started by the location's registration, not by a press */
  auto?: boolean
  /** what the registration's auto-start did, newest; null when this location never auto-started (older ones, Place plates) */
  autoStart?: AutoStart | null
  /** the candidate id the free border score suggests in the newest batch (pre-select it); absent = not scored */
  suggested?: string
  /** the newest batch: measured credits of its generation job and of its seam step (null = not settled / not measured);
   *  seamInGenerationJob = the seam ran inside the generation job, so `seam` stays null and its cost is in `generation` */
  credits?: { generation: number | null; seam: number | null; seamInGenerationJob: boolean; batch: string | null }
  /** the estimate a new pair (Build / re-roll = POST /__lab/surround) is checked against: same as price.credits */
  rerollCredits?: number
  /** the lighting line a Build with no typed text would use, and where it came from ('default' = the generic line) */
  lighting?: { line: string | null; from: 'request' | 'meta' | 'prompt' | 'menu' | 'default' }
  /** meta.json `world`, null until the level is fitted on registration or a surround is picked */
  world?: WorldMeta | null
  /** the newest batch's recipe ('e57-opt3+seam'; null for batches made before it) */
  recipe?: string | null
  /** where the build is (null when nothing runs); `stageEstimated` = inferred from the elapsed time of the one Cloud job */
  stage?: BuildStage | null
  stageEstimated?: boolean
  /** the recipe a Build / re-roll would use now (rerollCredits is its price) */
  buildRecipe?: WorldRecipe
  /** pano-590011: the level is only assumed (no floor found), so the pasted still may sit off the horizon: the newest
   *  batch's recorded warning, else what a Build now would record (recipe.ts levelWarning); null = fitted / not pano */
  levelWarning?: string | null
}

export interface SurroundRequest { locationId: string; lighting?: string; seeds?: 1 | 2; recipe?: WorldRecipe }
/** POST /__lab/surround/world: the camera height (free). A preset alone sets its height; a height alone is custom. */
export interface WorldRequest { locationId: string; cameraPreset?: 'chest' | 'eye'; eyeHeightM?: number }
export interface PickRequest { locationId: string; candidate: string }

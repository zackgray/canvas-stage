/**
 * Wave B contract (docs/wave-b-contract.md): a locked take on disk, its clay export, its hero stills and its Layout-To-Render
 * passes. Every track imports these types, routes and paths from here; nobody redefines them. Fields are only ever added.
 * Pure (no DOM, no node), so the server and the browser share it.
 */
import type { CameraSample } from '../labs/controller/take/types.ts'
import type { ClayIdPass, KeyframeRole, L2RGrade, L2RKeyframe } from './keyframeContract.ts'
import type { ClayDepth, L2RRenderDof, TakeLens } from './lensContract.ts'
import type { ClayTiming } from './clayTiming.ts'
import type { TakePerfFields } from './takePerfContract.ts'
export type { ClayTiming } from './clayTiming.ts'

export type ShotStatus = 'queued' | 'running' | 'done' | 'failed'

/** A take the operator locked: what every later stage (clay, hero, render) is built from. Written once as take.json. */
export interface TakeRecord {
  /** `take-<stamp>`; also the folder name under SHOTS_DIR */
  id: string
  worldId: string
  packId: string | null
  fps: 24
  /** 8k+1 */
  frames: number
  /** the smoothed camera track, as recorded (seconds from the take start) */
  samples: CameraSample[]
  /** mm, 36 mm-wide sensor, at frame 0 */
  focal: number
  viewAspect: number
  /** the pack frame on the set at frame 0 (warpPlan sourceStart) */
  perfStart: number
  /** see startKey() */
  startKey: string
  lockedAt: string
  createdAt: string
  /** T1: world time (s) when the take started recording (warpPlan timelineStart), so the clay replans the exact camera times */
  timelineStart?: number
}
/** per-take performance (takePerfContract.ts): `perf` (hashes to packId) and `perfFrom` */
export interface TakeRecord { perf?: TakePerfFields['perf']; perfFrom?: TakePerfFields['perfFrom'] }
export * from './takePerfContract.ts'
/** per-take set (takeSetContract.ts) */ export interface TakeRecord { set?: import('./takeSetContract.ts').TakeSetFields['set']; setFrom?: import('./takeSetContract.ts').TakeSetFields['setFrom']; setSince?: import('./takeSetContract.ts').TakeSetFields['setSince'] }
/** set stamps (setStampContract.ts): `setKey` on the clay, the clay finish and the still */ type SetStamp = import('./setStampContract.ts').SetStampFields; export interface ClayExport { setKey?: SetStamp['setKey'] } export interface ClayFinishRequest { setKey?: SetStamp['setKey'] } export interface HeroStill { setKey?: SetStamp['setKey'] }

/** The clay layout video of a take: 1920x1088, `frames` at 24 fps, shaded server-side from browser depth. */
export interface ClayExport {
  takeId: string
  startKey: string
  /** public path, /lab-assets/shots/<takeId>/clay/clay.mp4 */
  mp4: string | null
  frames: number
  width: 1920
  height: 1088
  status: ShotStatus
  error?: string
  /** T1: frames shaded so far while running (0..frames) */
  done?: number
  /** T1: frames where the face was found and sculpted (YuNet on the colour pass); 0 = no face sculpt */
  faceFrames?: number
  /** T1: public path of the clay's frame 0 still (PNG) */
  still?: string | null
  /** T1: ISO dates */
  startedAt?: string
  finishedAt?: string
  /** kit clay (appended): how the frames were made: 'shaded' = browser passes shaded by the Python clay (panorama worlds),
   *  'browser' = finished clay frames rendered in the page from a kit world's true geometry, encoded by ffmpeg only */
  method?: 'shaded' | 'browser'
  /** (per-take performance) the performer the page captured these frames with (MocapLayer's pack id; null = no performer), sent
   *  as `packId` on the finish body and stored here (server/clay/stamps.ts). The finish refuses one that is not the take's (409);
   *  a stored one that is not the take's reads as not prepared (clay_stale). Absent = an older clay: passes */
  packId?: string | null
  /** (answered by GET /__lab/clay only, never stored) when the take's kit set last changed after these frames were made (a piece
   *  built or moved): the frames show the old set, so a draw prepares them again first (free) before anything is sent */
  setMoved?: string
}

/** A rendered opening frame (Klein 4B hero graph on the take's frame 0 + the cast face card). One still per PNG. */
export interface HeroStill {
  id: string
  takeId: string
  /** the take's startKey when this still was made; isStale compares it */
  startKey: string
  png: string
  seed: number
  jobId: string | null
  credits: number
  approved: boolean
  createdAt: string
  /** kit worlds (appended): the cast card the world's performance named when the still was made (null = none named, the
   *  project's first card). Render's readiness calls the still stale when Perform has since picked another. Absent = not a kit take. */
  castId?: string | null
}

/** One Layout-To-Render pass of a take's clay + an approved still, then the free finish (unsharp, grain). */
export interface L2RRender {
  id: string
  takeId: string
  stillId: string
  clay: string
  raw: string | null
  finished: string | null
  jobId: string | null
  credits: number
  status: ShotStatus
  error?: string
}

export { isStale, startKey } from './startKey.ts'

// ---------------------------------------------------------------- routes

export const ROUTES = { takes: '/__lab/takes', clay: '/__lab/clay', hero: '/__lab/hero', l2r: '/__lab/l2r' } as const

/** GET /__lab/takes -> list; POST /__lab/takes/lock (body: the take minus id/startKey/dates) -> the saved record */
export interface TakesListResponse { takes: TakeRecord[] }
/** `perf` (TakeLockPerf, takePerfContract.ts) is the performer actually playing; perfFrom is the server's to stamp */
export type TakeLockRequest = Omit<TakeRecord, 'id' | 'startKey' | 'lockedAt' | 'createdAt' | 'perfFrom'>
export interface TakeLockResponse {
  take: TakeRecord
  /** T1: true when an identical take was already locked and this is that record */
  reused?: boolean
}

/** POST /__lab/clay/depth?take=&frame=&kind=colour|depth|bg (binary body), then POST /__lab/clay/finish {takeId} */
export type ClayFrameKind = 'colour' | 'depth' | 'bg'
  /** kit clay (appended): a kit world's finished clay frame (PNG, 1920x1088), rendered in the page; the server only encodes it */
  | 'final'
  /** (appended) a kit frame's metric depth, a 16-bit greyscale PNG (1920x1088) of planar metres x CLAY_DEPTH_UNIT_M (see ClayDepth) */
  | 'zdepth'
  /** Wave 0.5 (appended; accepted once track E2 builds it): a keyframe's flat-colour ID pass, an sRGB PNG (1920x1088), see ClayIdPass */
  | 'id'
/** T1: one clay frame's camera, as the browser planned it (warpPlan), written to clay/cameras.json for the shading script */
export interface ClayCamera {
  i: number
  t: number
  position: [number, number, number]
  quaternion: [number, number, number, number]
  focal: number
  /** vertical fov at 1920x1088 */
  vfovDeg: number
  /** (retired) a focus distance an older clay's cameras.json carries; nothing writes or reads it */
  focus?: number
}
export interface ClayFinishRequest {
  takeId: string
  /** T1: one per frame (take.frames of them); required by the server */
  cameras?: ClayCamera[]
  /** T1: key light direction in camera space (x right, y up, z toward the viewer); default E96's camera-right key */
  key?: [number, number, number]
  /** (per-take performance) the performer the frames were captured with (null = none); a finish that is not the take's is a 409 */
  packId?: string | null
}
export interface ClayResponse { clay: ClayExport }

/** POST /__lab/hero/opening?take= (PNG body), POST /__lab/hero {takeId, seed?}, POST /__lab/hero/approve, GET ?take= */
export interface HeroRenderRequest {
  takeId: string
  seed?: number
  /** T2 (appended): 1..4 seeds in one job (default 1) */
  count?: number
  /** T2 (appended): the owner's own prompt, replacing the built one (still scrubbed of fire and grain words) */
  prompt?: string
  /** T2 (appended): the perform session whose cast card gives the face (default: the one lifted into the take's pack) */
  sid?: string
}
export interface HeroApproveRequest { takeId: string; stillId: string }
/** T2 (appended): opening = the uploaded frame 0 and the startKey it was captured for; running = a hero job in flight; unrecovered = paid jobs whose png never landed (POST /__lab/jobs/recover {jobId}) */
export interface HeroListResponse {
  stills: HeroStill[]
  opening?: { present: boolean; startKey: string | null }
  running?: { since: string; what: string } | null
  unrecovered?: { jobId: string; recordId: string; ids: string[]; since: string }[]
}
/** T2 (appended): `stills` is every still of one press (count > 1); `still` is the first */
export interface HeroResponse { still: HeroStill; stills?: HeroStill[] }

/** POST /__lab/l2r {takeId, stillId}, POST /__lab/l2r/recover {jobId}, POST /__lab/l2r/finish {renderId}, GET ?take= */
export interface L2RRenderRequest { takeId: string; stillId: string; seed?: number }
export interface L2RRecoverRequest { jobId: string }
export interface L2RFinishRequest { renderId: string }
export interface L2RListResponse { renders: L2RRender[] }
export interface L2RResponse { render: L2RRender }

/** What every stub answers until its track builds it. */
export const NOT_BUILT = { status: 501, error: 'not built yet', code: 'not_built' } as const

// ---------------------------------------------------------------- disk layout

/** under the app's public/: lab-assets/shots/<takeId>/{take.json, clay/, hero/, l2r/} */
export const SHOTS_DIR = 'lab-assets/shots'
export const shotPaths = (takeId: string) => {
  const root = `${SHOTS_DIR}/${takeId}`
  return { root, take: `${root}/take.json`, clay: `${root}/clay`, hero: `${root}/hero`, l2r: `${root}/l2r` }
}

// ---------------------------------------------------------------- appended by T3 (Layout-To-Render)
// Interface merging: the fields below are added to the shapes above; nothing above is changed.

/** T3: what an L2R render also records (all optional, so a record written without them still reads). */
export interface L2RRender {
  /** the prompt sent, exactly */
  prompt?: string
  seed?: number
  /** = the take's frames = the clay's frames */
  frames?: number
  /** the estimate shown before the press */
  estimateCredits?: number
  /** true when `credits` is the estimate because the balance delta was not measured */
  creditsEstimated?: boolean
  createdAt?: string
  /** the free finish failed: the raw is kept and Finish can be pressed again */
  finishError?: string
  /** fix pass (B5): the process that wrote the `running` intent; a dead one with no job behind it never submitted */
  pid?: number
  /** fix pass (B5): stopped before it reached Cloud (`failed`, never billed, credits 0); Render offers to render again */
  interrupted?: boolean
  /** recipe wave (join): which clay video the model was sent as the layout (`clay` is its URL): the massing clay when current, else precise */
  layoutClay?: 'massing' | 'precise'
}

/** T3: POST /__lab/l2r also takes a prompt override (fire / grain clauses dropped as for the hero still; all-banned = 400; empty = built from the world and the cast). */
export interface L2RRenderRequest { prompt?: string }

/** Why a take cannot be rendered yet; `where` says what to do about it. */
export type L2RMissingCode = 'no_take' | 'no_clay' | 'clay_not_done' | 'clay_stale' | 'clay_frames' | 'clay_set_moved' | 'no_still' | 'stale_still' | 'unknown_tag'
  /** only the take's words changed since the approved first frame was drawn: Render offers a redraw or the words on this frame (wordsOnFrame.ts) */
  | 'words_changed'
export interface L2RMissing { code: L2RMissingCode; message: string; where: string }

/** T3: GET /__lab/l2r?take= also answers what the take has, what is missing, the prompt, the price and what runs. */
export interface L2RListResponse {
  take?: TakeRecord | null
  clay?: ClayExport | null
  /** the take's approved still (fresh or stale; `missing` says which) */
  still?: HeroStill | null
  missing?: L2RMissing[]
  /** the prompt a render sends without an override */
  prompt?: string | null
  estimate?: { credits: number; perFrame: number; frames: number; basis: string } | null
  running?: { since: string; what: string; jobId?: string } | null
  /** render ids whose free finish runs now */
  finishing?: string[]
  /** a Comfy target is set (COMFY_API_KEY / COMFY_BASE_URL) */
  configured?: boolean
}

/** what a paid press says when no Comfy target is set, in plain words (the variable names are in SETUP.md and the server log) */
export const NO_COMFY_TARGET = 'Comfy is not connected yet. Add your Comfy key (see SETUP), then restart the app.'

/** T3: about 0.21 cr per frame from real takes (97 frames = 20-25 cr), until this app's own renders say otherwise. */
export const L2R_CR_PER_FRAME = 0.21

// ---------------------------------------------------------------- appended: clay depth, and the retired lens / depth-of-field records
// Interface merging again: every field is optional, so a take, clay or render written before it still reads. The shapes live in
// lensContract.ts and are re-exported here.
export * from './lensContract.ts'

export interface TakeRecord {
  /** (retired) the lens an older take recorded with the live depth of field; new takes record none and nothing reads it */
  lens?: TakeLens
}

export interface ClayExport {
  /** present when every frame's depth was uploaded with the clay (kit worlds only): the hero still's depth control */
  depth?: ClayDepth | null
}

export interface L2RRender {
  dof?: L2RRenderDof | null
}

// ---------------------------------------------------------------- appended by Wave 0.5 (Bible, docs/preproduction-plan-fable.md §4)
// Interface merging, every field optional: a take, still, clay or render written before the Bible still reads. The new shapes
// live in keyframeContract.ts (this file is at its size limit) and are re-exported here, so tracks import them from this file.
export * from './keyframeContract.ts'

export interface TakeRecord {
  /** the scene Bible's version at lock (bibleContract BibleRecord.version); absent = locked before the Bible or with none */
  bibleVersion?: number
  /** the take's one-line action, typed at Lock ("the performer stops and looks up"); joins the composed Render prompt */
  action?: string
}
export interface HeroStill {
  /** track B: which keyframe this still is (absent = the opening, as every still before the Bible) */
  role?: KeyframeRole
  /** track B: the clay frame it was drawn on (absent = 0) */
  frame?: number
  /** the Bible version it was drawn against; Render calls it stale when the Bible has moved on (the castId pattern) */
  bibleVersion?: number
}
/** A still that guides Layout-To-Render at a frame: a HeroStill with its role and frame always set. */
export interface KeyframeStill extends HeroStill { role: KeyframeRole; frame: number }
export interface ClayExport {
  /** track E2: present when the ID pass was rendered at the keyframe indices (kit worlds with entities only) */
  idPass?: ClayIdPass | null
  /** tidy wave (CLAY): where a kit clay's Prepare spent its time, page and server (clayTiming.ts); absent = older, or panorama */
  timing?: ClayTiming
}
export interface L2RRender {
  /** track C: the mid / end guides sent beyond the opening still (absent or empty = none) */
  keyframes?: L2RKeyframe[]
  /** track C: the grade to the master in the finish */
  grade?: L2RGrade | null
  /** (QA run 5) the raw came back solid black: kept on disk and billed, filed failed, never finished */
  blank?: true
}

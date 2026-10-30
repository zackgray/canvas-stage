/**
 * Wire types of the Clip endpoint (server/clip/plugin.ts), shared with the browser client
 * (src/labs/projection/video/clipApi.ts). Types only, so the browser bundle pulls in nothing server-side.
 *
 * A clip folder (renders/video-<stamp>/) is written by the lab (video/clipExport.ts) through /__lab/save:
 *   depth/depth_NNN.png   16-bit near-bright inverse depth over the clip's fixed range, holes 0 (math/guide.ts)
 *   cameras.json          ClipCameras: the exact camera of every guide frame
 *   meta.json             source label, size, fps, frames, depth range
 * and the server adds:
 *   guide.mp4             the guide frames as sent to LTX (ffmpeg, 24 fps)
 *   clip-<stamp>.mp4/.json one LTX clip and its record per render
 *   finish-<clip id>-<preset>[-grain-<grain>][-dof-…].mp4/.json   a Finish of one clip (local, free; the clip is never touched)
 */
import type { FinishDof, FinishPreset } from '../look/types.ts'
import type { WorldStamp } from './pose.ts'

export type ClipUpscale = 'off' | 'x2'

/** Finish clip's grain: video grain (clip/grain.ts), not the still's; scaled by the preset (subtle = half, off = none). */
export type ClipGrain = 'off' | 'fine' | 'heavy'

/** Camera of one guide frame. Positions in scene units (metres), quaternion [x, y, z, w], three.js convention. */
export interface ClipCameraFrame {
  i: number
  /** seconds from the take's start */
  t: number
  position: [number, number, number]
  quaternion: [number, number, number, number]
  /** the take's focal length (mm, 36 mm-wide sensor) */
  focal: number
  /** vertical fov (deg) of the guide frame at the guide's aspect (768×448) */
  vfovDeg: number
  /** vertical fov (deg) the lab's export camera has at this pose: comparable with a still's meta.json camera.vfovDeg */
  stillVfovDeg: number
}

export interface ClipCameras {
  convention: string
  width: number
  height: number
  fps: number
  /** the source still's aspect the stills of this set are exported at */
  sourceAspect: number
  guideRange: { near: number; far: number }
  frames: ClipCameraFrame[]
  /** the world at frame 0 (the take's start): a first-frame still's meta.json `world` must match it (pose.ts) */
  worldStart?: WorldStamp
}

/** POST /__lab/clip: one LTX-2.5 job. */
export interface ClipRequest {
  /** the clip folder (video-<stamp>) under /lab-assets/renders/ */
  folder: string
  /**
   * renders-relative PNG of the first frame: a still (<export>/stills/<id>.png), its grade or its finish
   * (<export>/looks/<id>.png). Its export's camera must match the take's start pose.
   */
  first: string
  /** sent exactly as given */
  prompt: string
  /** LTXVAddGuide strength, 0.5-0.7 (E1c) */
  strength: number
  upscale: ClipUpscale
  seed: number
}

export interface ClipRecord {
  id: string
  folder: string
  /** renders-relative path of the first-frame PNG, and its URL */
  first: string
  firstUrl: string
  /** URLs of the clip and of the guide it followed */
  output: string
  guide: string
  prompt: string
  strength: number
  upscale: ClipUpscale
  seed: number
  frames: number
  fps: number
  width: number
  height: number
  createdAt: string
  jobId: string
  wallSeconds: number
  execSeconds: number | null
  costCents: number | null
  credits: number | null
  costSettled: boolean
}

export interface ClipStatus {
  busy: boolean
  phase: string
  /** clips this server process has submitted, and its cap (CANVAS_CLIP_CAP); at the cap every POST is a 429 */
  count: number
  cap: number
  configured: boolean
  lastError: string | null
  /** every clip on disk, oldest first */
  results: ClipRecord[]
}

/** POST /__lab/clip/finish: local, free. The still Finish on every frame of one clip, DoF from the guide's depth. */
export interface ClipFinishRequest {
  /** the clip folder and the clip's id in it (clip-<stamp>) */
  folder: string
  clip: string
  preset: FinishPreset
  /** absent = fine (the default); always off with preset off */
  grain?: ClipGrain
  /** blur each frame by its own guide depth frame, with this lens; absent = no DoF */
  dof?: FinishDof
}

export interface ClipFinishRecord {
  id: string
  folder: string
  clip: string
  /** URLs of the LTX clip (input, never overwritten) and of the finished clip */
  input: string
  output: string
  preset: FinishPreset
  /** absent on finishes made before video grain (they carry the still's grain) */
  grain?: ClipGrain
  /** the lens asked for, frame 0's focal length on that format, and the largest blur (px) over every frame */
  dof?: FinishDof & { focalMm: number; maxRadiusPx: number }
  frames: number
  fps: number
  width: number
  height: number
  createdAt: string
  /** wall time of the whole finish, and per second of clip; worker threads used */
  wallSeconds: number
  secondsPerClipSecond: number
  workers: number
}

export interface ClipFinishStatus {
  busy: boolean
  /** e.g. "finishing frame 31/89" */
  phase: string
  lastError: string | null
  /** every clip finish on disk, oldest first */
  results: ClipFinishRecord[]
}

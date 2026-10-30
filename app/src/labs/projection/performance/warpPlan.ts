// Planning a CrossView warp from a recorded take (pure; warpExport.ts renders it).
//
// Clock: the warp starts at the pack frame on the set when the take started (sourceStart = round(timelineStart · fps);
// 0 for every take recorded on the stage: Record rewinds the world) and warp frame i is world time (sourceStart + i)/fps
// — the moment pack frame sourceStart + i is on the set — so it lines up frame for frame with the source clip window
// CrossView is given beside it (the endpoint cuts the source from sourceStart). Length: LTX's 8n+1 rule (9 up to the
// server's CANVAS_CROSSVIEW_MAX_FRAMES, default 193), the longest that fits in the pack from sourceStart: min(fit, max). The camera of frame i is the take's (smoothed) camera at that world
// time: take time = world time − the take's clock start. Frames past the take's end hold its last pose.
// Lens: the operator's view (its vfov at the view's aspect) centre-cropped / covered to the warp's aspect (clipGuide.ts).
// Holes: E29's convention, pure magenta (255, 0, 255) wherever neither the set nor the actors have geometry; a real
// surface that happens to be exactly magenta is nudged to (254, 0, 254) so magenta means "no geometry" and nothing else.
import { DEFAULT_MAX_FRAMES } from '../../../../server/crossview/spec'
import { threeFovDeg } from '../../controller/math/lens'
import { evaluateTrack, type CameraSample } from '../../controller/take/types'
import type { WorldTrack } from '../video/action'
import { cropVfov } from '../video/clipGuide'
import { trackPoseAt } from '../world/track'
import type { CarPose } from '../world/path'
import { frameTime, type PackTiming } from './frames'

/** LTX's frame rule: 8n+1, 9 up to the server's limit (CANVAS_CROSSVIEW_MAX_FRAMES, default 193; 121 is the proven length). */
export const MIN_WARP = 9
export const MAX_WARP = DEFAULT_MAX_FRAMES
/** The longest 8n+1 frame count (<= `max`) that fits in `available` frames; 0 when fewer than 9. */
export const fit8n1 = (available: number, max = MAX_WARP) => (available < MIN_WARP ? 0 : Math.min(max, 8 * Math.floor((available - 1) / 8) + 1))

export const HOLE = [255, 0, 255] as const
const NEAR_HOLE = [254, 0, 254] as const

export interface WarpTake {
  smoothed: CameraSample[]
  /** world time when the take started recording */
  timelineStart: number
  /** the operator view's aspect while recording */
  viewAspect: number
  /** the car per take time, when one moved */
  track?: WorldTrack
}

export interface WarpFrame {
  i: number
  /** world time of this frame = i / fps */
  t: number
  /** take time the camera is read at (clamped to the take) */
  takeT: number
  position: [number, number, number]
  quaternion: [number, number, number, number]
  focal: number
  /** this frame's vertical fov at the warp's aspect */
  vfovDeg: number
}

export interface WarpPlan {
  /** the pack frame warp frame 0 shows (cameras.json sourceStart) */
  sourceStart: number
  frames: WarpFrame[]
  /** frames past the take's end (holding its last pose) */
  held: number
  /** each frame's recorded car poses, or undefined = the world's paths at that time */
  poses: (Map<string, CarPose> | undefined)[]
}

/** `aspect`: the warp's width / height. `maxFrames`: the longest window (the server's limit; default 193). */
export function planWarp(take: WarpTake, pack: PackTiming, aspect: number, maxFrames = MAX_WARP): WarpPlan {
  if (!take.smoothed.length) throw new Error('empty take')
  const s0 = take.smoothed[0].t
  const length = take.smoothed[take.smoothed.length - 1].t - s0
  const sourceStart = Math.max(0, Math.round(Math.max(0, take.timelineStart) * pack.fps))
  const n = fit8n1(pack.frames - sourceStart, maxFrames)
  if (!n) {
    throw new Error(sourceStart ? `the take starts at performance frame ${sourceStart}: fewer than ${MIN_WARP} frames of the performance are left after it — record from the start`
      : `the performance has ${pack.frames} frames; CrossView needs at least ${MIN_WARP}`)
  }
  const objects = take.track?.objects.length ? take.track.objects : null
  let held = 0
  const frames: WarpFrame[] = []
  const poses: WarpPlan['poses'] = []
  for (let i = 0; i < n; i++) {
    const t = frameTime(sourceStart + i, pack)
    const takeT = Math.min(length, Math.max(0, t - take.timelineStart))
    if (t - take.timelineStart > length + 1e-6) held++
    const s = evaluateTrack(take.smoothed, s0 + takeT)
    frames.push({
      i, t, takeT, position: [...s.position], quaternion: [...s.quaternion], focal: s.focal,
      vfovDeg: cropVfov(threeFovDeg(s.focal, take.viewAspect), take.viewAspect, aspect),
    })
    poses.push(objects ? new Map(objects.map((o) => [o.id, trackPoseAt(o, takeT)])) : undefined)
  }
  return { sourceStart, frames, held, poses }
}

/**
 * A rendered frame (sRGB RGBA, planar depth; top row first) -> the warp's RGB: magenta exactly where the depth says
 * nothing was drawn, the colour elsewhere (never magenta itself). Returns the hole share too.
 */
export function paintHoles(rgba: Uint8Array, depth: Float32Array): { rgb: Uint8Array; holeShare: number } {
  const n = depth.length
  if (rgba.length !== n * 4) throw new Error(`colour has ${rgba.length / 4} pixels, depth ${n}`)
  const rgb = new Uint8Array(n * 3)
  let holes = 0
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2]
    const px = !(depth[i] > 0) ? HOLE : r === HOLE[0] && g === HOLE[1] && b === HOLE[2] ? NEAR_HOLE : null
    if (px === HOLE) holes++
    rgb[i * 3] = px ? px[0] : r; rgb[i * 3 + 1] = px ? px[1] : g; rgb[i * 3 + 2] = px ? px[2] : b
  }
  return { rgb, holeShare: n ? holes / n : 0 }
}

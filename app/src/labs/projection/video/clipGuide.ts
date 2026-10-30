// Planning a depth-guide clip from a recorded take (pure; clipExport.ts renders it).
//
// Timing: the take's smoothed samples are resampled at 24 fps from its first sample, to the smallest 8n+1 frame count
// that covers the whole move (LTX packs 8 frames per latent + the first), at most 121 (5.0 s). The few frames past the
// take's end hold its last pose (a short settle, never a speed change); a take longer than 5 s is cut at 5 s.
//
// Lens: during the take the operator view had vfov = threeFovDeg(focal, view aspect) (36 mm-wide sensor); a still's
// export camera keeps that vfov at the source still's aspect (Stage.exportCamera). LTX centre-crops the still to
// 768×448, so each guide frame renders the same crop: cropVfov(that vfov, source aspect, 768/448). With the view's
// aspect unchanged between the still and the guide export, frame 0 is exactly the still's framing.
import { threeFovDeg } from '../../controller/math/lens'
import { evaluateTrack, type CameraSample } from '../../controller/take/types'
import { CLIP_FPS, GUIDE_H, GUIDE_W, MAX_FRAMES, MIN_FRAMES } from '../../../../server/clip/spec.ts'
import type { ClipCameraFrame } from '../../../../server/clip/types.ts'

export const GUIDE_ASPECT = GUIDE_W / GUIDE_H

/** Frames for a move of `duration` seconds at 24 fps: the smallest 8n+1 covering it, clamped to 9-121. */
export function guideFrameCount(duration: number): number {
  const need = Math.ceil(Math.max(0, duration) * CLIP_FPS - 1e-6) + 1
  return Math.min(MAX_FRAMES, Math.max(MIN_FRAMES, Math.ceil((need - 1) / 8) * 8 + 1))
}

export interface GuideTiming {
  samples: CameraSample[]
  /** frames past the take's end that hold its last pose */
  held: number
  /** seconds of the take past 5 s that the guide leaves out */
  cut: number
}

/** The take at 24 fps, t from 0, 8n+1 frames (see the header). */
export function resampleTake(take: CameraSample[]): GuideTiming {
  if (take.length === 0) throw new Error('empty take')
  const t0 = take[0].t
  const duration = take[take.length - 1].t - t0
  const n = guideFrameCount(duration)
  const samples = Array.from({ length: n }, (_, i) => ({ ...evaluateTrack(take, t0 + i / CLIP_FPS), t: i / CLIP_FPS }))
  const covered = (n - 1) / CLIP_FPS
  return {
    samples,
    held: Math.max(0, n - 1 - Math.floor(duration * CLIP_FPS + 1e-6)),
    cut: Math.max(0, Math.round((duration - covered) * 100) / 100),
  }
}

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

/**
 * Vertical fov of a centre crop: a frame at `srcAspect` with vertical fov `vfovDeg`, scaled to cover `dstAspect` and
 * centre-cropped (ImageScale crop=center). A wider source keeps its vfov; a narrower one keeps its horizontal fov.
 */
export function cropVfov(vfovDeg: number, srcAspect: number, dstAspect: number): number {
  if (srcAspect >= dstAspect) return vfovDeg
  return deg(2 * Math.atan(Math.tan(rad(vfovDeg) / 2) * (srcAspect / dstAspect)))
}

/** The camera of every guide frame. `viewAspect`: the operator view's aspect; `sourceAspect`: the set's still. */
export function guideCameras(samples: CameraSample[], viewAspect: number, sourceAspect: number): ClipCameraFrame[] {
  return samples.map((s, i) => {
    const stillVfovDeg = threeFovDeg(s.focal, viewAspect)
    return {
      i, t: s.t, position: [...s.position], quaternion: [...s.quaternion], focal: s.focal,
      vfovDeg: cropVfov(stillVfovDeg, sourceAspect, GUIDE_ASPECT), stillVfovDeg,
    }
  })
}

/** The take's start pose as a still's export camera would record it (for the pose check before a still is picked). */
export function startPose(take: CameraSample[], viewAspect: number) {
  const s = take[0]
  return { position: [...s.position], quaternion: [...s.quaternion], vfovDeg: threeFovDeg(s.focal, viewAspect) }
}

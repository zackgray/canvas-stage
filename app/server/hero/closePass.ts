/**
 * Suggest a mid keyframe for a figure who passes close to camera (S1, 2026-10-23). A figure who enters mid-take and grows large on
 * screen renders as the clay proxy (a toy helmet) or hovers unless a keyframe still shows him at his closest pass; the opening
 * still shows nobody there. Free and pure: the performers' ground tracks and the take's recorded camera samples in, the frame
 * where each figure is largest on screen out, snapped to the 8-grid a mid keyframe needs (isMidFrame), when his projected height
 * passes a third of the frame. Wiring (not in this folder): Shoot's keyframe picker (HeroStrip/useHeroStill) offers
 * `closePassSuggestion(...)?.frame` as the mid frame (frameFor's `pick`), with `.why` as the line under it.
 */
import * as THREE from 'three'
import { evaluateTrack, type CameraSample } from '../../src/labs/controller/take/types.ts'
import { isMidFrame, snapFrame } from '../../src/shared/keyframeContract.ts'
import { cameraOf } from './kitView.ts'

/** a figure taller than this share of the frame height, at a frame other than 0, wants a keyframe of its own */
export const CLOSE_PASS_MIN_HEIGHT = 1 / 3

/** one figure's ground position over the take: `at(t)` = [x, z] at t seconds, or null while he is not on the stage yet */
export interface FigureTrack { id: string; label: string; height?: number; at(t: number): [number, number] | null }

export interface FigurePass { id: string; label: string; /** the frame he is largest (raw) */ peakFrame: number; /** share of frame height at that frame */ peakHeight: number; /** share at frame 0 */ openingHeight: number }
export interface ClosePassSuggestion {
  id: string; label: string
  /** the mid keyframe to pick: on the 8-grid, valid for isMidFrame, the grid frame that shows him largest */
  frame: number
  /** his height as a share of the frame height at that frame */
  height: number
  why: string
}

/** a figure walking `path` at a constant `speed` (m/s) from `delay` s; null before he starts, the last point once he arrives */
export function constantSpeedTrack(id: string, label: string, path: [number, number][], speed: number, delay = 0): FigureTrack {
  const seg = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]))
  return {
    id, label,
    at(t) {
      if (t < delay) return null
      let s = (t - delay) * speed
      for (let i = 0; i < seg.length; i++) {
        if (s <= seg[i] || i === seg.length - 1) {
          const k = seg[i] > 0 ? Math.min(1, s / seg[i]) : 1
          return [path[i][0] + (path[i + 1][0] - path[i][0]) * k, path[i][1] + (path[i + 1][1] - path[i][1]) * k]
        }
        s -= seg[i]
      }
      return path[0]
    },
  }
}

/** a figure's projected height at `frame`, as a share of the frame height; 0 when he is not on stage, behind the camera or off to the side */
export function heightAt(f: FigureTrack, samples: CameraSample[], frame: number, fps: number): number {
  const t = frame / fps, g = f.at(t)
  if (!g || !samples.length) return 0
  const s = evaluateTrack(samples, t), cam = cameraOf(s)
  const h = f.height ?? 1.8, feet = new THREE.Vector3(g[0], 0, g[1]), head = new THREE.Vector3(g[0], h, g[1])
  const inCam = (v: THREE.Vector3) => v.clone().applyMatrix4(cam.matrixWorldInverse).z < -cam.near
  if (!inCam(feet) || !inCam(head)) return 0
  const a = feet.project(cam), b = head.project(cam)
  if (Math.min(a.x, b.x) > 1.1 || Math.max(a.x, b.x) < -1.1) return 0
  return Math.abs(b.y - a.y) / 2
}

/** every figure's largest frame and its size, with his size at frame 0 */
export function figurePasses(figures: FigureTrack[], samples: CameraSample[], frames: number, fps: number): FigurePass[] {
  return figures.map((f) => {
    let peakFrame = 0, peakHeight = 0
    for (let k = 0; k < frames; k++) { const v = heightAt(f, samples, k, fps); if (v > peakHeight) { peakHeight = v; peakFrame = k } }
    return { id: f.id, label: f.label, peakFrame, peakHeight, openingHeight: heightAt(f, samples, 0, fps) }
  })
}

/** the grid frames around a raw frame (the one at or below, the one above) that a mid keyframe may use */
const gridAround = (raw: number, frames: number): number[] =>
  [...new Set([snapFrame(raw), snapFrame(raw) - 8, snapFrame(raw) + 8, 8])].filter((k) => isMidFrame(k, frames))

/**
 * The mid keyframe worth picking, or null: the figure who is largest on screen at a frame other than 0, past a third of the frame
 * height, and not already that big in the opening still. The frame is the grid frame (isMidFrame) near his peak where he is biggest. The biggest such figure wins.
 */
export function closePassSuggestion(figures: FigureTrack[], samples: CameraSample[], frames: number, fps: number, minHeight = CLOSE_PASS_MIN_HEIGHT): ClosePassSuggestion | null {
  let best: ClosePassSuggestion | null = null
  for (const p of figurePasses(figures, samples, frames, fps)) {
    if (p.peakFrame === 0 || p.peakHeight < minHeight || p.openingHeight >= minHeight) continue
    const f = figures.find((x) => x.id === p.id)!
    const pick = gridAround(p.peakFrame, frames).map((k) => ({ k, v: heightAt(f, samples, k, fps) })).sort((a, b) => b.v - a.v)[0]
    if (!pick || pick.v < minHeight || (best && pick.v <= best.height)) continue
    best = {
      id: p.id, label: p.label, frame: pick.k, height: pick.v,
      why: `${p.label} comes close to the camera, about ${Math.round(pick.v * 100)}% of the frame tall at frame ${pick.k}. A keyframe still there keeps him from rendering as the clay proxy.`,
    }
  }
  return best
}

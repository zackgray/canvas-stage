// Raw take -> smoothed -> keyframes + lint, and the JSON export.
import { SENSOR_WIDTH_MM } from '../math/lens'
import type { LintReport } from './lint'
import { lintTake } from './lint'
import type { SampleError } from './reduce'
import { maxTrackError, reduceKeyframes, toleranceFromSlider } from './reduce'
import { smoothSamples } from './smoothTake'
import type { CameraSample, RawTake } from './types'
import type { WorldTrack } from '../../projection/video/action'

export interface ProcessedTake {
  raw: RawTake
  smoothed: CameraSample[]
  keyframes: CameraSample[]
  tolerance: number
  error: SampleError
  lint: LintReport
  /** what moved in the world during the take (the projection stage's car), per raw sample; absent in the controller lab */
  worldTrack?: WorldTrack
  /** the operator view's aspect while it was recorded (the projection stage; the shell's pages size the view differently) */
  viewAspect?: number
  /** the world's track hash while it was recorded (World.trackHash; the clip's first-frame still must match it) */
  trackHash?: string
}

export function processTake(raw: RawTake, toleranceSlider: number): ProcessedTake {
  const smoothed = smoothSamples(raw.samples, raw.fps)
  return { ...reduceProcessed(raw, smoothed, toleranceSlider), lint: lintTake(smoothed, raw.fps) }
}

/** Re-run only the reduction (the tolerance slider moved). */
export function reduceProcessed(raw: RawTake, smoothed: CameraSample[], toleranceSlider: number) {
  const keyframes = reduceKeyframes(smoothed, toleranceFromSlider(toleranceSlider))
  return { raw, smoothed, keyframes, tolerance: toleranceSlider, error: maxTrackError(smoothed, keyframes) }
}

const r = (v: number, d = 4) => Number(v.toFixed(d))
const rs = (s: CameraSample) => ({
  t: r(s.t, 4),
  position: s.position.map((v) => r(v)),
  quaternion: s.quaternion.map((v) => r(v, 6)),
  focalLength: r(s.focal, 2),
  ...(s.focus !== undefined ? { focusDistance: r(s.focus, 3) } : {}),
})

export function takeToJson(p: ProcessedTake, includeRaw = false) {
  return {
    format: 'canvas-stage.take',
    version: 1,
    createdAt: new Date().toISOString(),
    fps: p.raw.fps,
    duration: r(p.raw.samples[p.raw.samples.length - 1].t, 4),
    timelineStart: r(p.raw.timelineStart, 4),
    rig: p.raw.rig,
    sensorWidthMm: SENSOR_WIDTH_MM,
    conventions: 'metres, Y up, three.js camera (looks down -Z); quaternion [x, y, z, w]; focal in mm',
    smoothing: { live: p.raw.smoothingAmount, post: 'one-euro zero-phase' },
    reduction: { tolerance: p.tolerance, maxError: p.error, keyframeCount: p.keyframes.length, sampleCount: p.smoothed.length },
    lint: { dominant: p.lint.dominant, warnings: p.lint.warnings, maxAngularSpeedDeg: r(p.lint.maxAngularSpeedDeg, 1) },
    events: p.raw.events,
    keyframes: p.keyframes.map(rs),
    ...(includeRaw ? { rawSamples: p.raw.samples.map(rs) } : {}),
    ...(p.worldTrack ? { worldTrack: p.worldTrack } : {}),
  }
}

export function downloadTake(p: ProcessedTake, includeRaw = false) {
  const json = JSON.stringify(takeToJson(p, includeRaw), null, 2)
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `take-${p.raw.rig}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

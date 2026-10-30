/**
 * A performance pack: a lifted, locked-off performance (actors only) expressed in a location's metric frame, so the
 * projection lab can play it inside the set. Written by scripts/lift-performance.ts to
 * /lab-assets/performances/<id>/ (gitignored):
 *   manifest.json                 this document
 *   frames/color_NNN.png          stabilised colour, every frame in the set's projector camera (8-bit RGB)
 *   frames/depth_NNN.png          actor-only PLANAR depth, 16-bit linear: metres = value * metersPerUnit, 0 = no actor
 *   frames/mask_NNN.png           actor mask (SAM 2.1), 8-bit grey, 255 = actor
 *   source.mp4                    the stabilised clip (CrossView's reference input)
 *   background.png                the clean plate (temporal median of the non-actor pixels)
 *   background_depth.png          optional: the plate's PLANAR depth, 16-bit linear (metres = value * its metersPerUnit,
 *                                 0 = none) — the median of the lift's own scaled depth, so the set behind the actors
 *                                 can be the performance's room (t29); packs lifted before it have none
 * Frames are numbered from 0 (`%03d` -> 000 … frames-1). `source` is the location's projector camera (three.js
 * conventions, the camera looks down -z): the pack's pixels and depths are in that camera. Pure, shared with the browser.
 */

import { readPackPin, type PackPin } from '../shared/worldContract.ts'

export const PERFORMANCES_URL = '/lab-assets/performances'
export const DEPTH_ENCODING = 'planar-metres-16bit'
/** LTX's longest clip; a browser holds every frame of a pack, so packs stay short. */
export const MAX_FRAMES = 289
export const MAX_SIZE = 4096

export interface PerformanceCamera {
  vfovDeg: number
  /** width / height */
  aspect: number
  position: [number, number, number]
  /** x, y, z, w (three.js order) */
  quaternion: [number, number, number, number]
}

export interface PerformancePack {
  id: string
  label: string
  /** a location shot id in /lab-assets/locations/manifest.json */
  locationId: string
  fps: number
  frames: number
  width: number
  height: number
  source: PerformanceCamera
  depth: { encoding: typeof DEPTH_ENCODING; metersPerUnit: number }
  /** printf-style patterns relative to the pack folder, one `%0Nd` each */
  files: { color: string; depth: string; mask: string }
  sourceClip: string
  background: string
  /** the clean plate's planar depth (same encoding as `depth`, its own scale), when the lift wrote one */
  backgroundDepth?: { file: string; metersPerUnit: number }
  /** the performance prompt the clip was generated from */
  prompt: string
  /** the floor pin (Wave A): depth.metersPerUnit already carries it; absent on unpinned packs */
  pin?: PackPin
}

export class PerformanceShapeError extends Error {}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
const LOCATION_RE = /^[\w.@-]{1,120}$/
/** a relative path inside the pack: no leading slash, no backslash, no '..' or empty segment, no scheme */
const REL_RE = /^[\w\-.%/]+$/
const FRAME_RE = /%0([1-6])d/g

type Obj = Record<string, unknown>
function fail(where: string, what: string): never {
  throw new PerformanceShapeError(`${where}: ${what}`)
}
function obj(v: unknown, where: string): Obj {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(where, 'must be an object')
  return v as Obj
}
function str(v: unknown, where: string, max = 4000): string {
  if (typeof v !== 'string' || v.length > max) fail(where, `must be a string of at most ${max} characters`)
  return v
}
function num(v: unknown, where: string, lo: number, hi: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= lo || v > hi) fail(where, `must be a number in (${lo}, ${hi}]`)
  return v
}
function int(v: unknown, where: string, lo: number, hi: number): number {
  if (!Number.isInteger(v) || (v as number) < lo || (v as number) > hi) fail(where, `must be an integer ${lo}-${hi}`)
  return v as number
}
function vec<N extends number>(v: unknown, where: string, n: N): number[] {
  if (!Array.isArray(v) || v.length !== n || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    fail(where, `must be ${n} finite numbers`)
  }
  return [...(v as number[])]
}

/** A file path inside the pack folder. */
export function isPackPath(p: string): boolean {
  return REL_RE.test(p) && !p.startsWith('/') && !p.split('/').some((s) => s === '' || s === '.' || s === '..')
}
function relPath(v: unknown, where: string): string {
  const s = str(v, where, 200)
  if (!isPackPath(s)) fail(where, 'must be a relative path inside the pack (no "..", no leading "/")')
  if (s.includes('%')) fail(where, 'must not contain "%"')
  return s
}
function framePattern(v: unknown, where: string, ext: string): string {
  const s = str(v, where, 200)
  if (!isPackPath(s)) fail(where, 'must be a relative path inside the pack (no "..", no leading "/")')
  if ((s.match(FRAME_RE) ?? []).length !== 1 || s.replace(FRAME_RE, '').includes('%')) fail(where, 'must contain exactly one %0Nd frame number')
  if (!s.endsWith(ext)) fail(where, `must be a ${ext} pattern`)
  return s
}

/** Frame `i` of a pattern ("frames/color_%03d.png", 7 -> "frames/color_007.png"). */
export function framePath(pattern: string, i: number): string {
  return pattern.replace(/%0([1-6])d/, (_, w: string) => String(i).padStart(Number(w), '0'))
}

/** Site URL of a file in a pack. */
export function packUrl(id: string, rel: string): string {
  if (!ID_RE.test(id) || !isPackPath(rel)) throw new PerformanceShapeError(`bad pack file ${id}/${rel}`)
  return `${PERFORMANCES_URL}/${id}/${rel}`
}

/** Shape-check a pack object; throws PerformanceShapeError naming the first bad field. Unknown fields are dropped. */
export function toPerformance(v: unknown): PerformancePack {
  const o = obj(v, 'performance')
  if (typeof o.id !== 'string' || !ID_RE.test(o.id)) fail('performance.id', 'must be a lower-case id (a-z, 0-9, -)')
  if (typeof o.locationId !== 'string' || !LOCATION_RE.test(o.locationId)) fail('performance.locationId', 'must be a location shot id')
  const width = int(o.width, 'performance.width', 16, MAX_SIZE)
  const height = int(o.height, 'performance.height', 16, MAX_SIZE)
  const s = obj(o.source, 'performance.source')
  const aspect = num(s.aspect, 'source.aspect', 0, 10)
  if (Math.abs(aspect - width / height) > 0.01 * aspect) fail('source.aspect', `must match width / height (${(width / height).toFixed(4)})`)
  const quaternion = vec(s.quaternion, 'source.quaternion', 4)
  if (Math.abs(Math.hypot(...quaternion) - 1) > 1e-3) fail('source.quaternion', 'must be a unit quaternion')
  const d = obj(o.depth, 'performance.depth')
  if (d.encoding !== DEPTH_ENCODING) fail('depth.encoding', `must be "${DEPTH_ENCODING}"`)
  const f = obj(o.files, 'performance.files')
  let backgroundDepth: PerformancePack['backgroundDepth']
  if (o.backgroundDepth !== undefined) {
    const b = obj(o.backgroundDepth, 'performance.backgroundDepth')
    backgroundDepth = { file: relPath(b.file, 'backgroundDepth.file'), metersPerUnit: num(b.metersPerUnit, 'backgroundDepth.metersPerUnit', 0, 1) }
  }
  const pin = readPackPin(o)
  return {
    id: o.id, label: str(o.label, 'performance.label', 200), locationId: o.locationId,
    fps: num(o.fps, 'performance.fps', 0, 120), frames: int(o.frames, 'performance.frames', 1, MAX_FRAMES), width, height,
    source: {
      vfovDeg: num(s.vfovDeg, 'source.vfovDeg', 0, 179), aspect,
      position: vec(s.position, 'source.position', 3) as PerformanceCamera['position'],
      quaternion: quaternion as PerformanceCamera['quaternion'],
    },
    depth: { encoding: DEPTH_ENCODING, metersPerUnit: num(d.metersPerUnit, 'depth.metersPerUnit', 0, 1) },
    files: {
      color: framePattern(f.color, 'files.color', '.png'), depth: framePattern(f.depth, 'files.depth', '.png'),
      mask: framePattern(f.mask, 'files.mask', '.png'),
    },
    sourceClip: relPath(o.sourceClip, 'performance.sourceClip'), background: relPath(o.background, 'performance.background'),
    ...(backgroundDepth ? { backgroundDepth } : {}),
    prompt: str(o.prompt, 'performance.prompt'),
    ...(pin ? { pin } : {}),
  }
}

/** A manifest.json's text as a pack; throws PerformanceShapeError when it is not JSON or not a valid pack. */
export function parsePerformance(text: string): PerformancePack {
  let v: unknown
  try { v = JSON.parse(text) } catch { throw new PerformanceShapeError('performance: not JSON') }
  return toPerformance(v)
}

/** Planar metres from one decoded depth sample (0..65535); NaN = no actor. */
export function depthMetres(sample: number, pack: Pick<PerformancePack, 'depth'>): number {
  return sample > 0 ? sample * pack.depth.metersPerUnit : NaN
}

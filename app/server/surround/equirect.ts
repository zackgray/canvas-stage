/**
 * The level panorama frame around a location's still camera, as pure math (the canvas script, scripts/surround_canvas.py,
 * computes the same thing with OpenCV; the client far layer builds its mesh from it). Port of experiments/e46_geom.py.
 *
 * Camera space = the still's (three.js axes: +x right, +y up, -z forward, camera at the origin).
 * Level frame: +Y = world up (level.json `up`), -Z = the still's forward direction levelled, +X right.
 * `toCam(R, v)` takes a level-frame vector to camera space. Equirect: lon = atan2(x, -z), lat = asin(y);
 * u = lon/2pi + 0.5, v = 0.5 - lat/pi (v = 0 is the top row). The still sits at its true yaw (the centre column), pitch and FOV.
 */
import type { LocationLevel, Vec3 } from './types.ts'

/** The app assumes every still was shot this far down (scripts/location_level.py uses the same): the fallback when no floor was fitted. */
export const ASSUMED_PITCH_DEG = 4.3

export const assumedUp = (pitchDeg = ASSUMED_PITCH_DEG): Vec3 => {
  const p = (pitchDeg * Math.PI) / 180
  return [0, Math.cos(p), Math.sin(p)]
}

const norm = (v: Vec3): Vec3 => { const n = Math.hypot(...v); return [v[0] / n, v[1] / n, v[2] / n] }
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** Row-major 3x3, columns = level X, Y (= up), Z (= -forward) in camera space: cam = R * level. */
export type Basis = readonly [number, number, number, number, number, number, number, number, number]

export function levelBasis(up: Vec3 = assumedUp()): Basis {
  const y = norm(up)
  // the still's forward (0,0,-1) minus its component along up, then unit
  const f = norm([-y[0] * -y[2], -y[1] * -y[2], -1 - y[2] * -y[2]])
  const z: Vec3 = [-f[0], -f[1], -f[2]]
  const x = cross(y, z)
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]]
}

/** The level frame a location is drawn in: level.json `up`, else the app's assumed pitch (a missing file is `assumed`). */
export const upOf = (level: Pick<LocationLevel, 'up'> | null | undefined): Vec3 => (level && level.up.length === 3 ? level.up : assumedUp())

export const toCam = (R: Basis, v: Vec3): Vec3 => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]]
export const toLevel = (R: Basis, v: Vec3): Vec3 => [R[0] * v[0] + R[3] * v[1] + R[6] * v[2], R[1] * v[0] + R[4] * v[1] + R[7] * v[2], R[2] * v[0] + R[5] * v[1] + R[8] * v[2]]

/** Unit level-frame direction of equirect coordinates (u, v in 0..1). */
export function uvToDir(u: number, v: number): Vec3 {
  const lon = (u - 0.5) * 2 * Math.PI
  const lat = (0.5 - v) * Math.PI
  return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), -Math.cos(lat) * Math.cos(lon)]
}

export function dirToUv(d: Vec3): [number, number] {
  const [x, y, z] = norm(d)
  return [Math.atan2(x, -z) / (2 * Math.PI) + 0.5, 0.5 - Math.asin(Math.max(-1, Math.min(1, y))) / Math.PI]
}

/** Half-angle tangents of the still: ty from the vertical FOV, tx from the aspect. */
export const tanHalf = (vfovDeg: number, w: number, h: number): [number, number] => {
  const ty = Math.tan((vfovDeg * Math.PI) / 360)
  return [(ty * w) / h, ty]
}

export interface StillSize { width: number; height: number; vfovDeg: number }

/** Still pixel (px, py: pixel-centre coordinates, 0 = first centre) -> equirect (u, v). */
export function stillToPano(R: Basis, s: StillSize, px: number, py: number): [number, number] {
  const [tx, ty] = tanHalf(s.vfovDeg, s.width, s.height)
  const nx = ((px + 0.5) / s.width) * 2 - 1
  const ny = 1 - ((py + 0.5) / s.height) * 2
  return dirToUv(toLevel(R, [nx * tx, ny * ty, -1]))
}

/** Equirect (u, v) -> still pixel, or null when the direction is outside the still's frame. The inverse of stillToPano. */
export function panoToStill(R: Basis, s: StillSize, u: number, v: number): [number, number] | null {
  const d = toCam(R, uvToDir(u, v))
  const fwd = -d[2]
  if (fwd <= 1e-3) return null
  const [tx, ty] = tanHalf(s.vfovDeg, s.width, s.height)
  const nx = d[0] / fwd / tx
  const ny = d[1] / fwd / ty
  if (Math.abs(nx) > 1 || Math.abs(ny) > 1) return null
  return [((nx + 1) / 2) * s.width - 0.5, ((1 - ny) / 2) * s.height - 0.5]
}

/** Share of the sphere the still covers (solid angle of its frustum / 4pi), for the status line. */
export function footprintShare(s: StillSize): number {
  const [tx, ty] = tanHalf(s.vfovDeg, s.width, s.height)
  return (4 * Math.atan((tx * ty) / Math.sqrt(1 + tx * tx + ty * ty))) / (4 * Math.PI)
}

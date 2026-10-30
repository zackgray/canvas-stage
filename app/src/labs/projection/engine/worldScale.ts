// The world root scale (plan-build-1022 L5): a world's metres come from its camera height, not from MoGe's metres. The
// set, the surround and the performance are scaled together about the projector by
//     s = world.eyeHeightM / level.cameraHeightM
// so the fitted floor lands exactly the world's camera height below the master camera. A uniform scale about the
// projector leaves the master view's pixels unchanged (every point slides along its own ray); everything that reads
// world units afterwards (the orbit floor clamp, rig heights, fly speed, exported cameras) reads true metres.
// Pure (no three.js scene objects).
import { readWorld } from '../../../shared/worldContract.ts'

/** `level.json` as written (the fields the readers use; engine/level.ts re-exports it). */
export interface LevelFile {
  /** world up in the still's camera space (three.js axes), unit length */
  up: [number, number, number]
  /** camera height over the fitted floor, metres; null when the floor could not be fitted */
  cameraHeightM: number | null
  method: 'floor-ransac' | 'assumed'
  /** the vertical FOV the floor was fitted at (the depth's lens then); absent on old files */
  vfovDeg?: number
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** outside this a computed scale is not trusted (a broken level file), and the world stays at 1 */
const S_MIN = 0.05
const S_MAX = 20

/**
 * level.json measured at the vfov it was fitted at, re-expressed for the set built at `setVfovDeg`. The same depth
 * through a wider or narrower lens is the cloud stretched across the image plane: (x, y, z) -> (r·x, r·y, z) with
 * r = tan(set/2) / tan(fit/2). The floor plane n·p = -h maps to (n / D)·p = -h with D = diag(r, r, 1), so its normal and
 * height follow exactly. A file with no vfov, or the set's own vfov, comes back unchanged.
 * (766: fitted at MoGe's 62.63°, the set is the crop's true 56.61°: 2.606 -> 2.307, which the set's mesh measures.)
 */
export function levelForLens(file: LevelFile, setVfovDeg: number | null | undefined): LevelFile {
  const fit = file.vfovDeg
  if (!fit || !setVfovDeg || Math.abs(fit - setVfovDeg) < 1e-6) return file
  const r = Math.tan((setVfovDeg * Math.PI) / 360) / Math.tan((fit * Math.PI) / 360)
  const m = [file.up[0] / r, file.up[1] / r, file.up[2]]
  const n = Math.hypot(m[0], m[1], m[2])
  return {
    ...file,
    up: [m[0] / n, m[1] / n, m[2] / n],
    cameraHeightM: file.cameraHeightM === null ? null : file.cameraHeightM / n,
    vfovDeg: setVfovDeg,
  }
}

/** The vertical FOV the location's set is built at (meta.json `lens.vfovDeg`), or null. */
export function lensVfovOf(meta: unknown): number | null {
  const lens = isObj(meta) && isObj(meta.lens) ? meta.lens : null
  const v = lens?.vfovDeg
  return typeof v === 'number' && v > 0 && v < 180 ? v : null
}

/** True when a meta.json is a built world (it has a `world` block); only then is the set rescaled. */
export const isBuiltWorld = (meta: unknown): boolean => isObj(meta) && isObj(meta.world)

export interface WorldScale {
  /** the root scale: true metres per app unit of the set as loaded */
  s: number
  /** the world's camera height (m) the scale was set to, null when s = 1 by default */
  eyeHeightM: number | null
  /** the lens-corrected level (projector camera space, app units before the scale), null when there is none */
  level: LevelFile | null
}

/**
 * The scale for a set: `worldMeta` is the WORLD's meta.json (its `world.eyeHeightM`), `level` the set location's
 * level.json and `setVfovDeg` the vfov the set is built at. s = 1 (today's behaviour) unless the meta is a built world
 * and the level has a fitted floor: old locations, assumed levels and broken files keep their app units.
 */
export function worldScaleOf(worldMeta: unknown, level: LevelFile | null, setVfovDeg: number | null): WorldScale {
  const lv = level ? levelForLens(level, setVfovDeg) : null
  const h = lv?.method === 'floor-ransac' ? lv.cameraHeightM : null
  if (!isBuiltWorld(worldMeta) || !h) return { s: 1, eyeHeightM: null, level: lv }
  const eye = readWorld(worldMeta).eyeHeightM
  const s = eye / h
  if (!(s >= S_MIN && s <= S_MAX)) return { s: 1, eyeHeightM: null, level: lv }
  return { s, eyeHeightM: eye, level: lv }
}

// The location's measured level (`locations/<id>/level.json`, written by scripts/location_level.py): which way is up
// and where the floor is, in the set's world. The Orbit rig, the mouse orbit and the orbit buttons turn about this up
// instead of assuming every still was shot 4.3 degrees downward. Without the file (or a floor that could not be
// fitted, `method: 'assumed'`) there is no level and everything behaves as before. React-free.
import { Quaternion, Vector3, type PerspectiveCamera } from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { setControlsUp } from './pivot'
import type { LevelFile } from './worldScale'

// `level.json` as written lives beside the pure scale maths (worldScale.ts), so the server can read it without three.js
export type { LevelFile }

/** The level in the set's world. */
export interface Level {
  /** world up, unit */
  up: Vector3
  /** a point on the fitted floor, or null when only the up was measured */
  floor: Vector3 | null
}

/** Validate a parsed `level.json`; null when it is not usable. */
export function parseLevelFile(json: unknown): LevelFile | null {
  const j = json as Partial<LevelFile> | null
  if (!j || !Array.isArray(j.up) || j.up.length !== 3 || !j.up.every((n) => Number.isFinite(n))) return null
  const len = Math.hypot(j.up[0], j.up[1], j.up[2])
  if (len < 0.5) return null
  const h = j.cameraHeightM
  const fov = j.vfovDeg
  return {
    up: [j.up[0] / len, j.up[1] / len, j.up[2] / len],
    cameraHeightM: typeof h === 'number' && Number.isFinite(h) && h > 0 ? h : null,
    method: j.method === 'floor-ransac' ? 'floor-ransac' : 'assumed',
    ...(typeof fov === 'number' && fov > 0 && fov < 180 ? { vfovDeg: fov } : {}),
  }
}

/**
 * The file placed in the set: the still's camera space is the projector's, so up turns by the projector's rotation and
 * the floor is `cameraHeightM` below the projector along it, times the world root scale `s` (worldScale.ts: the set is
 * scaled about the projector, so the floor sits s·h below it, the world's camera height). Null for the fallback.
 */
export function worldLevel(file: LevelFile, projector: { position: Vector3; quaternion: Quaternion }, s = 1): Level | null {
  if (file.method !== 'floor-ransac') return null
  const up = new Vector3(...file.up).applyQuaternion(projector.quaternion).normalize()
  const floor = file.cameraHeightM === null ? null : projector.position.clone().addScaledVector(up, -file.cameraHeightM * s)
  return { up, floor }
}

/** The location id of a lab source id (ids are prefixed `<manifest>/<id>` on collision). */
export const locationOfSource = (source: string) => source.slice(source.lastIndexOf('/') + 1)

/** Fetch a location's `level.json`; null when it has none (or is not JSON: a dev server answers 200 for a miss). */
export async function fetchLevelFile(source: string, get: typeof fetch = fetch): Promise<LevelFile | null> {
  try {
    const r = await get(`/lab-assets/locations/${encodeURIComponent(locationOfSource(source))}/level.json`)
    return r.ok ? parseLevelFile(await r.json()) : null
  } catch {
    return null
  }
}

let active: Level | null = null
/** The level the rigs and the orbit moves use now (null: today's assumption). */
export const getActiveLevel = () => active
export const setActiveLevel = (l: Level | null) => { active = l }

/** Where the camera's floor clamp sits along `up`: the fitted floor, else 0.2 m (the old fixed clamp). */
export const FALLBACK_FLOOR = 0.2
export const floorAlongUp = (l: Level | null) => (l?.floor ? l.up.dot(l.floor) : FALLBACK_FLOOR)

/** Turn the view's mouse orbit (and the orbit buttons) about the level's up, and publish it to the rig; null = +Y. */
export function applyLevel(stage: { view: PerspectiveCamera; controls: OrbitControls }, level: Level | null) {
  setActiveLevel(level)
  setControlsUp(stage.controls, stage.view, level?.up ?? null)
}

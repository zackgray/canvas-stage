/**
 * Wave A contract (docs/plan-build-1022.md §3 "A0", docs/perform-contract.md "World, stand-ins and pin"): the fields Wave A
 * ADDS to a location's meta.json, a Perform session's place.json and a performance pack's manifest.json. Every track imports
 * these types and readers from here; nobody redefines them. Fields are only ever added, never renamed.
 *
 * Readers take raw parsed JSON (unknown) and never throw: an old file without the new fields reads with the defaults below,
 * a malformed field reads as its default (or null where "absent" is meaningful). Pure, so the server (`../../src/shared/
 * worldContract.ts`) and the browser share it.
 */

export type Vec3 = [number, number, number]
/** x0, y0, x1, y1 in frame pixels */
export type Box4 = [number, number, number, number]

// ---------------------------------------------------------------- meta.json `world`

export type CameraPreset = 'chest' | 'eye'
export type WorldRecipe = 'pano-590011' | 'e57-opt3+seam'

export const CAMERA_PRESETS: readonly CameraPreset[] = ['chest', 'eye']
/** the camera height each preset stands for, metres (owner, 2026-10-22: chest 1.2, eye 1.6) */
export const PRESET_HEIGHT_M: Record<CameraPreset, number> = { chest: 1.2, eye: 1.6 }
export const DEFAULT_PRESET: CameraPreset = 'eye'
export const WORLD_RECIPES: readonly WorldRecipe[] = ['pano-590011', 'e57-opt3+seam']
/** what a world built from now on uses (L1) */
export const DEFAULT_RECIPE: WorldRecipe = 'pano-590011'
/** what a world WITHOUT a recipe field was built with (every world before Wave A) */
export const LEGACY_RECIPE: WorldRecipe = 'e57-opt3+seam'
/** plausible camera heights; outside this a stored value is ignored */
const HEIGHT_MIN_M = 0.2
const HEIGHT_MAX_M = 50

/** The Wave A fields of meta.json `world`. `eyeHeightM` IS the camera height (1.2 | 1.6 | custom): the world's metric anchor. */
export interface WorldFields {
  eyeHeightM: number
  cameraPreset: CameraPreset
  recipe: WorldRecipe
}

/**
 * What a world is made of (Stage3D, 2026-10-23): 'pano' = a still + MoGe depth + the surround panorama (every world before it);
 * 'kit' = real three.js geometry laid out by a ScenePlan (plan.json beside meta.json, src/stage3d). Absent = 'pano'.
 */
export type WorldKind = 'pano' | 'kit'
export const WORLD_KINDS: readonly WorldKind[] = ['pano', 'kit']
export const isWorldKind = (v: unknown): v is WorldKind => v === 'pano' || v === 'kit'

/** meta.json `world` as read: the Wave A fields plus the stage-1 ones (server/surround/types.ts WorldMeta), and `kind` (Stage3D). */
export interface WorldRead extends WorldFields {
  horizonRow: number | null
  builtAt: string | null
  kind: WorldKind
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const pos = (v: unknown): v is number => finite(v) && v > 0
const heightOk = (v: unknown): v is number => finite(v) && v >= HEIGHT_MIN_M && v <= HEIGHT_MAX_M

export const isCameraPreset = (v: unknown): v is CameraPreset => v === 'chest' || v === 'eye'
export const isWorldRecipe = (v: unknown): v is WorldRecipe => v === 'pano-590011' || v === 'e57-opt3+seam'

/**
 * meta.json `world` with defaults. Takes the whole meta.json (or its `world` object: both are accepted).
 * - no height, no preset → eye, 1.6 m
 * - preset only → that preset's height
 * - height only → the preset whose height it is (1.2 → chest), else eye (a custom height keeps the eye wording)
 * - recipe missing → 'e57-opt3+seam' (every world before Wave A)
 * - kind missing or unknown → 'pano'
 */
export function readWorld(metaOrWorld: unknown): WorldRead {
  const m = isObj(metaOrWorld) ? metaOrWorld : {}
  const w = isObj(m.world) ? m.world : m
  const height = heightOk(w.eyeHeightM) ? w.eyeHeightM : null
  const preset: CameraPreset = isCameraPreset(w.cameraPreset) ? w.cameraPreset
    : height !== null && Math.abs(height - PRESET_HEIGHT_M.chest) < 1e-6 ? 'chest' : DEFAULT_PRESET
  return {
    eyeHeightM: height ?? PRESET_HEIGHT_M[preset],
    cameraPreset: preset,
    recipe: isWorldRecipe(w.recipe) ? w.recipe : LEGACY_RECIPE,
    horizonRow: finite(w.horizonRow) ? w.horizonRow : null,
    builtAt: typeof w.builtAt === 'string' ? w.builtAt : null,
    kind: isWorldKind(w.kind) ? w.kind : 'pano',
  }
}

/** The camera-height line the screens show: "eye 1.6 m", "chest 1.2 m", "custom 1.45 m". */
export function cameraHeightLabel(w: WorldFields): string {
  const custom = Math.abs(w.eyeHeightM - PRESET_HEIGHT_M[w.cameraPreset]) > 1e-6
  return `${custom ? 'custom' : w.cameraPreset} ${Number(w.eyeHeightM.toFixed(2))} m`
}

// ---------------------------------------------------------------- meta.json `lens.from`

/** how the still's lens was found: MoGe's estimate, the point-map fit, or KNOWN (a crop cut at a known FOV, Wave A) */
export type LensFrom = 'moge' | 'point map' | 'known'
export const LENS_FROM: readonly LensFrom[] = ['moge', 'point map', 'known']

/** meta.json `lens.from`, null when absent or unknown. */
export function readLensFrom(meta: unknown): LensFrom | null {
  const lens = isObj(meta) && isObj(meta.lens) ? meta.lens : null
  const f = lens?.from
  return f === 'moge' || f === 'point map' || f === 'known' ? f : null
}

// ---------------------------------------------------------------- meta.json `surround` additions

/** the surround's own fitted ground: `up` in the surround's level frame (unit), `heightM` = camera height over it */
export interface SurroundFloor { up: Vec3; heightM: number }

/** Wave A fields on meta.json `surround`, beside the stage-1 ones (url, distUrl, width, height … stay as they are). */
export interface SurroundHiRes {
  /** the separate hi-res colour equirect (8192 wide, or 4096 as the fallback); distance and far mesh stay at `width` */
  colourUrl?: string
  colourWidth?: number
  colourHeight?: number
  floor?: SurroundFloor
}

export interface SurroundColour { url: string; width: number; height: number }

const surroundOf = (meta: unknown): Record<string, unknown> | null => {
  if (!isObj(meta)) return null
  return isObj(meta.surround) ? meta.surround : ('colourUrl' in meta || 'floor' in meta ? meta : null)
}

/** The hi-res colour, or null (old worlds: use `surround.url`). All three fields must be valid and 2:1. */
export function readSurroundColour(metaOrSurround: unknown): SurroundColour | null {
  const s = surroundOf(metaOrSurround)
  if (!s || typeof s.colourUrl !== 'string' || !s.colourUrl) return null
  const w = s.colourWidth, h = s.colourHeight
  if (!pos(w) || !pos(h) || !Number.isInteger(w) || !Number.isInteger(h) || w !== 2 * h) return null
  return { url: s.colourUrl, width: w, height: h }
}

/** The surround's fitted floor, or null (old worlds: no ground match). `up` is re-normalised. */
export function readSurroundFloor(metaOrSurround: unknown): SurroundFloor | null {
  const f = surroundOf(metaOrSurround)?.floor
  if (!isObj(f) || !heightOk(f.heightM) || !Array.isArray(f.up) || f.up.length !== 3 || !f.up.every(finite)) return null
  const [x, y, z] = f.up as number[]
  const n = Math.hypot(x, y, z)
  if (!(n > 1e-6)) return null
  return { up: [x / n, y / n, z / n], heightM: f.heightM }
}

// ---------------------------------------------------------------- place.json stand-in mode

export type SheetView = 'front' | 'three-quarter' | 'side' | 'back'
export const SHEET_VIEWS: readonly SheetView[] = ['front', 'three-quarter', 'side', 'back']
/** the character height dial's default, metres */
export const DEFAULT_CHARACTER_HEIGHT_M = 1.75

export interface StandIn {
  cardId: string
  version: number
  /** which matted sheet view stands in (facing comes from it + mirror) */
  view: SheetView
  mirror: boolean
  heightM: number
  /** where the feet touch the floor, in master-view pixels [x, y] */
  feetPx: [number, number]
  /** the stand-in's box in master-view pixels (what the lift seeds its boxes from) */
  boxPx: Box4
}

/** The stand-in fields of place.json. The old fields (sid, created, cast, firstFrame …) stay; `locationId` = the WORLD id. */
export interface StandInPlace {
  mode: 'standin'
  standins: StandIn[]
  cameraHeightM: number
  locationId: string
}

const vecN = (v: unknown, n: number): number[] | null => (Array.isArray(v) && v.length === n && v.every(finite) ? v as number[] : null)

/** One stand-in entry with defaults (front, not mirrored, 1.75 m); null when its card, version, feet or box is missing. */
export function readStandIn(v: unknown): StandIn | null {
  if (!isObj(v) || typeof v.cardId !== 'string' || !v.cardId) return null
  const version = v.version
  const feet = vecN(v.feetPx, 2), box = vecN(v.boxPx, 4)
  if (!finite(version) || !Number.isInteger(version) || version < 1 || !feet || !box) return null
  return {
    cardId: v.cardId, version,
    view: SHEET_VIEWS.includes(v.view as SheetView) ? v.view as SheetView : 'front',
    mirror: v.mirror === true,
    heightM: heightOk(v.heightM) ? v.heightM : DEFAULT_CHARACTER_HEIGHT_M,
    feetPx: [feet[0], feet[1]], boxPx: [box[0], box[1], box[2], box[3]],
  }
}

/** True when a place.json is a stand-in session (`mode: 'standin'`). Old sessions are classic Place. */
export const isStandInPlace = (place: unknown): boolean => isObj(place) && place.mode === 'standin'

/**
 * The stand-in fields of a place.json, or null for a classic Place session (no `mode`) or one without a world id.
 * Bad entries are dropped; `cameraHeightM` defaults to the eye preset (1.6).
 */
export function readStandInPlace(place: unknown): StandInPlace | null {
  if (!isObj(place) || place.mode !== 'standin' || typeof place.locationId !== 'string' || !place.locationId) return null
  const list = Array.isArray(place.standins) ? place.standins : []
  return {
    mode: 'standin',
    standins: list.map(readStandIn).filter((s): s is StandIn => s !== null),
    cameraHeightM: heightOk(place.cameraHeightM) ? place.cameraHeightM : PRESET_HEIGHT_M[DEFAULT_PRESET],
    locationId: place.locationId,
  }
}

// ---------------------------------------------------------------- pack manifest `pin`

/**
 * The floor pin: one depth scale k from the foot-contact frames (E78 step 5), WRITTEN IN PLACE on manifest.json:
 * `depth.metersPerUnit = rawMetersPerUnit × k`. Only the PERFORMER's depth is scaled: k is measured against the world's
 * floor, so scaling the plate (`backgroundDepth`) by k too would lift the floor with him and undo the pin (Wave A join).
 * `rawMetersPerUnit` is the lift's own scale, kept so a re-pin starts from it: pinning twice with the same k gives the same
 * manifest (idempotent).
 */
export interface PackPin {
  k: number
  /** the foot-contact frames the scale came from */
  frames: number[]
  /** median residual of the feet to the floor after the pin, cm */
  residualCm: number
  rawMetersPerUnit: number
}

/** manifest.json `pin`, or null for an unpinned pack (every pack before Wave A). */
export function readPackPin(manifest: unknown): PackPin | null {
  const p = isObj(manifest) && isObj(manifest.pin) ? manifest.pin : null
  if (!p || !pos(p.k) || !pos(p.rawMetersPerUnit) || !finite(p.residualCm) || p.residualCm < 0) return null
  const frames = Array.isArray(p.frames) ? p.frames.filter((f): f is number => finite(f) && Number.isInteger(f) && f >= 0) : []
  return { k: p.k, frames, residualCm: p.residualCm, rawMetersPerUnit: p.rawMetersPerUnit }
}

type Manifest = Record<string, unknown> & { depth?: { metersPerUnit?: unknown } }

/**
 * The manifest with a pin applied (pure; the caller writes it in place). Starts from the RAW scale (the existing pin's
 * `rawMetersPerUnit`, else the current `depth.metersPerUnit`), so re-pinning never compounds. The plate depth
 * (`backgroundDepth`) and every other field are kept as they are.
 */
export function applyPin<M extends Manifest>(manifest: M, pin: { k: number; frames: number[]; residualCm: number }): M {
  if (!pos(pin.k)) throw new Error('pin.k must be a positive number')
  const current = manifest.depth?.metersPerUnit
  if (!pos(current)) throw new Error('manifest.depth.metersPerUnit must be a positive number')
  const prev = readPackPin(manifest)
  const raw = prev?.rawMetersPerUnit ?? current
  const out: Manifest = { ...manifest, depth: { ...manifest.depth, metersPerUnit: raw * pin.k } }
  out.pin = { k: pin.k, frames: [...pin.frames], residualCm: pin.residualCm, rawMetersPerUnit: raw } satisfies PackPin
  return out as M
}

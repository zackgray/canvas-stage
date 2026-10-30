// Shared limits and geometry for the ScenePlan validator (plan.ts) and the repairer (planRepair.ts).
import { ENTITY_TAG_RE, type KitItem, type ScenePlan } from './contract.ts'
import { pieceOf } from './kit.ts'
import { PIECE_NOUN_RE } from './pieceKinds.ts'

export const LIMITS = {
  /** scale: a multiplier on the piece's own size, a sanity bound only (owner 2026-10-29: a grandstand built as a 2 m mesh must
   *  grow to tens of metres); the Stage holds a piece under MAX_PIECE_M across (studio/scene/pieceScale.ts) */
  seed: [0, 2147483647], at: 150, kit: 200, scale: [0.25, 100], yaw: [-360, 360], lift: [-2, 10],
  /** a piece's base tilt: enough to square up a generated mesh, not enough to turn one upside down */
  pitch: [-90, 90], roll: [-90, 90],
  /** a piece's travel: metres per second, and the most waypoints a drawn path keeps */
  propSpeed: [0.1, 20], movePath: 50,
  groundShade: [0, 1], puddles: [0, 200], tufts: [0, 20000], fogDensity: [0, 0.1], light: [0, 5], keyYaw: [-180, 360], keyElev: [0, 80],
  skyYaw: [-360, 360], skyLift: [-10, 20], skyGain: [0, 4], skyCut: [-10, 60], sentence: 600,
} as const

/** the corridor the performer's default walk uses when a plan has no `flat` */
export const DEFAULT_FLAT: [number, number, number, number] = [-4, -30, 4, 8]
/**
 * The one default 3D light's direction [yaw deg, elevation deg]. The planner's sun control no longer exists: a plan's
 * light.keyDir is still read and written (fields are only ever added), but the viewport light and the sky's sun disc
 * always sit here, so nothing in the 3D set moves that the draw and render never read.
 */
export const DEFAULT_KEY_DIR: readonly [number, number] = [150, 12]
/**
 * the sky every plan gets unless it names a panorama: not a file, a sky drawn in the dome's shader from what the plan says (its
 * sentence's time of day and weather, its key light, its fog; sky.ts). A plan that names a pano under SKY_PREFIX keeps that pano.
 */
export const DEFAULT_SKY = '/lab-assets/sky/procedural'
export const SKY_PREFIX = '/lab-assets/'
/** what a procedural sky may be asked to look like (`sky.look`); unset = read from the plan */
/** the ground's two shapes (ScenePlan.ground); unset reads as rolling */
export const GROUND_KINDS = ['flat', 'rolling'] as const

export const SKY_LOOKS = ['dawn', 'noon', 'dusk', 'night', 'overcast', 'storm', 'fog', 'interior'] as const
export const FOG_COLOR = /^#[0-9a-fA-F]{6}$/

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
export const inRange = (v: number, r: readonly [number, number] | readonly number[]): boolean => v >= r[0] && v <= r[1]
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** a generated piece's mesh (KitItem.glb): a .glb served from the app's own assets, never another origin or a path out of it */
export const GLB_PREFIX = '/lab-assets/'
export const GLB_LIMITS = { unitScale: [0.01, 100], yawOffset: [-360, 360], sink: [0, 5] } as const
const glbUrlOk = (u: unknown): boolean => typeof u === 'string' && u.startsWith(GLB_PREFIX) && !u.includes('..') && !u.includes('\\') && /\.glb(\?v=[\w-]{1,40})?$/.test(u) && !/^[a-z]+:/i.test(u)

/** what is wrong with a kit item's `glb` (and its plain-noun kind), one sentence each; [] = fine */
export function glbErrors(it: Record<string, unknown>, w: string): string[] {
  const out: string[] = [], g = it.glb as Record<string, unknown> | undefined
  if (!g || typeof g !== 'object' || Array.isArray(g)) return [`${w}.glb: must be an object like {"url":"/lab-assets/…/mesh.glb"}`]
  for (const k of Object.keys(g)) if (!k.startsWith('_') && !['url', 'massingUrl', 'yawOffsetDeg', 'unitScale', 'sink'].includes(k)) out.push(`${w}.glb: unknown field "${k}"`)
  if (!glbUrlOk(g.url)) out.push(`${w}.glb.url: must be a .glb path under ${GLB_PREFIX}`)
  if (g.massingUrl !== undefined && !glbUrlOk(g.massingUrl)) out.push(`${w}.glb.massingUrl: must be a .glb path under ${GLB_PREFIX}`)
  const n = (k: string, r: readonly number[]) => { const v = g[k]; if (v !== undefined && !(isNum(v) && inRange(v, r))) out.push(`${w}.glb.${k}: must be a number in ${r[0]}..${r[1]}`) }
  n('unitScale', GLB_LIMITS.unitScale); n('yawOffsetDeg', GLB_LIMITS.yawOffset); n('sink', GLB_LIMITS.sink)
  if (typeof it.kind !== 'string' || !PIECE_NOUN_RE.test(it.kind)) out.push(`${w}.kind: a generated piece's kind is a plain lower-case noun (up to 40 letters), got ${JSON.stringify(it.kind)}`)
  if (it.args !== undefined) out.push(`${w}.args: a generated piece takes no args`)
  return out
}

/** a kit item's pieceTag: its own ID-pass class, always a prop's */
export const pieceTagOk = (v: unknown): boolean => typeof v === 'string' && v.startsWith('prop:') && ENTITY_TAG_RE.test(v)

/**
 * (prop-movement wave) what is wrong with a raw KitItem `move` value, one sentence each; [] = fine. Shared by the plan validator
 * (plan.ts), the piece edit route (server/stage3d/pieceEdit.ts) and the repairer, so all three refuse the same shapes.
 */
export function moveErrors(v: unknown, w: string): string[] {
  if (typeof v !== 'object' || !v || Array.isArray(v)) return [`${w}.move: must be an object like {"path":[[x,z],[x,z]],"speed":3}`]
  const o = v as Record<string, unknown>, out: string[] = []
  for (const k of Object.keys(o)) if (!k.startsWith('_') && !['path', 'speed', 'faceTravel'].includes(k)) out.push(`${w}.move: unknown field "${k}" (allowed: path, speed, faceTravel)`)
  if (!Array.isArray(o.path) || o.path.length < 2) out.push(`${w}.move.path: must be a list of at least 2 ground points [x, z]`)
  else if (o.path.length > LIMITS.movePath) out.push(`${w}.move.path: ${o.path.length} points, at most ${LIMITS.movePath} allowed`)
  else o.path.forEach((p, i) => {
    if (!Array.isArray(p) || p.length !== 2 || !p.every(isNum)) out.push(`${w}.move.path[${i}]: must be [x, z] numbers`)
    else if (!inRange(p[0], [-LIMITS.at, LIMITS.at]) || !inRange(p[1], [-LIMITS.at, LIMITS.at])) out.push(`${w}.move.path[${i}]: [${p.join(', ')}] is outside -${LIMITS.at}..${LIMITS.at}`)
  })
  if (!isNum(o.speed) || !inRange(o.speed, LIMITS.propSpeed)) out.push(`${w}.move.speed: must be a number in ${LIMITS.propSpeed[0]}..${LIMITS.propSpeed[1]} metres per second`)
  if (o.faceTravel !== undefined && typeof o.faceTravel !== 'boolean') out.push(`${w}.move.faceTravel: must be true or false`)
  return out
}

/** the walk corridor is `flat` narrowed by this many metres on each x side (the flat margin is slack beside the path itself) */
export const CORRIDOR_MARGIN = 1.5

/** true when a kit item's footprint (a segment along its local +x, widened by half its half-width) touches the walk corridor */
export function inCorridor(it: KitItem, flat: ScenePlan['flat']): boolean {
  const piece = typeof it.kind === 'string' ? pieceOf(it.kind) : undefined
  if (!piece || !Array.isArray(it.at) || it.at.length !== 2) return false
  const [fx0, z0, fx1, z1] = flat ?? DEFAULT_FLAT, m = Math.min(CORRIDOR_MARGIN, (fx1 - fx0) / 4), x0 = fx0 + m, x1 = fx1 - m
  const args = piece.args.map((s, i) => it.args?.[i] ?? s.def), s = it.scale ?? 1
  const [a, b, w] = piece.extent(args), yaw = ((it.yawDeg ?? 0) * Math.PI) / 180, cx = Math.cos(yaw), sx = -Math.sin(yaw)
  const steps = Math.max(1, Math.ceil(((b - a) * s) / 0.5))
  for (let k = 0; k <= steps; k++) {
    const t = (a + ((b - a) * k) / steps) * s, px = it.at[0] + cx * t, pz = it.at[1] + sx * t, r = w * s * 0.5
    if (px > x0 - r && px < x1 + r && pz > z0 - r && pz < z1 + r) return true
  }
  return false
}

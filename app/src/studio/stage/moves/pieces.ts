// The Set's pieces as the Describe-a-move panel lists them (plan section 5, "Which piece is it about?"): each of the owner's
// props (made or tagged; pass 3: no scenery such as trees or walls) within
// CHIP_RADIUS of the picked point becomes a chip, nearest first, measured with Track C's measurePiece so the panel's reach
// answer is the same one planMove gives. Out-of-reach chips carry their distance and are picked to show planMove's refusal.
// The piece's world box feeds planMove's keys, so it must match how the world builds the piece (world.ts): kind+args build,
// scale, yawDeg, then the placement point and lift. Ground relief is ignored (a few cm against a 0.75 m reach).
import * as THREE from 'three'
import type { KitItem } from '../../../stage3d/contract'
import { pieceOf } from '../../../stage3d/kit'
import { measurePiece, REACH_M } from '../../../stage3d/moves/index.ts'
import type { BoxLike } from '../../../stage3d/moves/measure.ts'
import type { Vec3 } from '../../../stage3d/moves/types.ts'

/** metres from the point within which a piece is listed as a chip at all */
export const CHIP_RADIUS = 3

export type ReachPiece = {
  /** the kit index as a string: stable within one plan, and what the spec's prop.pieceId carries to playback */
  id: string
  /** the piece's own name for the chips and the refusal ("the hive") */
  name: string
  box: BoxLike
  /** metres from the point to the piece's nearest edge (Track C's measure) */
  distance: number
  /** within arm's reach: planMove will build keys for it */
  reachable: boolean
}

const localCache = new Map<string, BoxLike | null>()

/** the piece's local box, built once per kind+args (the build is the expensive part; same cache idea as liftSpots.halfSize) */
function kitLocalBox(it: KitItem): BoxLike | null {
  const piece = pieceOf(it.kind)
  if (!piece) return null
  const args = piece.args.map((a, j) => it.args?.[j] ?? a.def)
  const key = `${it.kind}:${args.join(',')}`
  if (!localCache.has(key)) {
    const b = new THREE.Box3().setFromObject(piece.build(...args))
    localCache.set(key, Number.isFinite(b.min.x) ? { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] } : null)
  }
  return localCache.get(key)!
}

/** a generated mesh (glb) has no builder here: approximate the unit-scaled cube the world scales it from */
function glbLocalBox(it: KitItem): BoxLike {
  const s = it.glb?.unitScale ?? 1
  return { min: [-s / 2, 0, -s / 2], max: [s / 2, s, s / 2] }
}

/** the piece's own box at scale 1, unturned (a generated mesh: its unit-scaled cube), or null for a kind the kit does not know */
export const pieceLocalBox = (it: KitItem): BoxLike | null => (it.glb ? glbLocalBox(it) : kitLocalBox(it))

/** the piece's axis-aligned world box, or null for a kind the kit does not know */
export function pieceWorldBox(it: KitItem): BoxLike | null {
  const local = pieceLocalBox(it)
  if (!local) return null
  const s = it.scale ?? 1
  const yaw = ((it.yawDeg ?? 0) * Math.PI) / 180
  const sin = Math.sin(yaw), cos = Math.cos(yaw)
  const [cx, , cz] = [it.at[0], 0, it.at[1]]
  const lift = it.lift ?? 0
  const box: BoxLike = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], corners: [] }
  // three's rotation.y = yaw maps a local (x, z) to (x cos + z sin, -x sin + z cos): the same turn world.ts gives the piece (QA run
  // 5: the old sign mirrored a turned piece's footprint about its own centre)
  const corner = (x: number, y: number, z: number): Vec3 => [x * s * cos + z * s * sin + cx, y * s + lift, -x * s * sin + z * s * cos + cz]
  for (const x of [local.min[0], local.max[0]]) for (const y of [local.min[1], local.max[1]]) for (const z of [local.min[2], local.max[2]]) {
    const w = corner(x, y, z)
    box.corners!.push(w)
    for (const i of [0, 1, 2] as const) {
      box.min[i] = Math.min(box.min[i], w[i])
      box.max[i] = Math.max(box.max[i], w[i])
    }
  }
  return box
}

/** a prop the owner made or tagged (a generated piece, or one tagged as a brief prop): the set's scenery never is */
export const isOwnProp = (it: KitItem): boolean => !!it.pieceTag || !!it.glb

/** the owner's props (isOwnProp) within CHIP_RADIUS of the point, nearest first, each with Track C's reach measure */
export function reachPieces(kit: readonly KitItem[], at: [number, number]): ReachPiece[] {
  const spot: Vec3 = [at[0], 0, at[1]]
  return kit.flatMap((it, i) => {
    if (!isOwnProp(it)) return []
    const box = pieceWorldBox(it)
    if (!box) return []
    const distance = measurePiece({ box, at: spot, facingYaw: 0 }).distance
    if (distance > CHIP_RADIUS) return []
    return [{ id: String(i), name: it.label?.trim() || it.kind, box, distance, reachable: distance <= REACH_M }]
  }).sort((a, b) => a.distance - b.distance)
}

const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/**
 * The piece the words are about, when they name exactly one piece within reach: the one the move goes into, out of, onto or at
 * ("reaches into the hive, takes out a frame" is about the hive), else the one piece named at all. Null when none or several.
 */
export function namedPiece(words: string, pieces: readonly ReachPiece[]): string | null {
  const w = ` ${words.toLowerCase()} `
  const near = pieces.filter((p) => p.reachable && p.name.trim())
  const named = (re: (n: string) => RegExp) => near.filter((p) => re(esc(p.name.toLowerCase().replace(/^the\s+/, ''))).test(w))
  const place = named((n) => new RegExp(`\\b(?:into|in|out of|from|onto|on|at|off|by|beside|near)\\s+(?:the|a|an|her|his|its|their)\\s+${n}\\b`))
  if (place.length === 1) return place[0].id
  const any = named((n) => new RegExp(`\\b${n}s?\\b`))
  return any.length === 1 ? any[0].id : null
}


/**
 * Where a generated piece goes in the world's plan (pure). E136/E137: TRELLIS.2 fronts face -x (yawOffsetDeg 90 turns them to +z),
 * the mesh is unit-ish sized (unitScale = the kind's real size / the mesh's largest side) and walk-on pieces are sunk. A piece built
 * again keeps its place; a planner kit item for the same noun gives up its place and turn; otherwise a free spot near the set's
 * centre, out of the walk corridor and off the other pieces, facing the master camera.
 */
import type { KitItem, ScenePlan } from '../../src/stage3d/contract.ts'
import { pieceKindOf } from '../../src/stage3d/pieceKinds.ts'
import { CORRIDOR_MARGIN, DEFAULT_FLAT, LIMITS } from '../../src/stage3d/planRules.ts'
import { KIT_MASTER_POSITION, KIT_MASTER_TARGET } from '../stage3d/master.ts'
import type { PieceRecord } from './spec.ts'

/** E136: TRELLIS.2 puts the object's front at yaw 270 */
export const TRELLIS_YAW_OFFSET = 90

const r2 = (v: number, k = 100) => Math.round(v * k) / k

/** The plan item for a built piece (place and turn filled in by placePiece). `extent`: the mesh's largest side in its own units. */
export function pieceItem(noun: string, tag: string, url: string, massingUrl: string | null, extent: number | null): KitItem {
  const k = pieceKindOf(noun)
  const unitScale = r2(k.size / (extent && extent > 0 ? extent : 1), 10000)
  return {
    kind: noun, at: [0, 0], pieceTag: `prop:${tag}`,
    glb: { url, ...(massingUrl ? { massingUrl } : {}), yawOffsetDeg: TRELLIS_YAW_OFFSET, unitScale, ...(k.sinkFrac ? { sink: r2(k.size * k.sinkFrac) } : {}) },
  }
}

const words = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/).filter(Boolean).map((w) => w.replace(/(ss|x|ch|sh)es$/, '$1').replace(/([^s])s$/, '$1'))

/** the planner's code-built item that stands for this noun ("crates" for "a wooden crate"): every word of its kind is in the noun */
export function kitMatch(kit: KitItem[], noun: string): number {
  const n = new Set(words(noun))
  return kit.findIndex((it) => !it.glb && words(it.kind).length > 0 && words(it.kind).every((w) => n.has(w)))
}

/** a free ground spot for a piece of `size` m: rings round the master view's target, the nearest that clears corridor and pieces */
export function freeSpot(plan: Pick<ScenePlan, 'kit' | 'flat'>, size: number): [number, number] {
  const [fx0, z0, fx1, z1] = plan.flat ?? DEFAULT_FLAT, m = Math.min(CORRIDOR_MARGIN, (fx1 - fx0) / 4), x0 = fx0 + m, x1 = fx1 - m
  const [cx, , cz] = KIT_MASTER_TARGET, r = size / 2
  const clear = (x: number, z: number) => {
    if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) return false
    if (z > KIT_MASTER_POSITION[2] - 3 - r) return false // ahead of the master camera
    return plan.kit.every((it) => Math.hypot(it.at[0] - x, it.at[1] - z) > r + 1.5)
  }
  for (const rad of [6, 9, 12, 15, 18, 24, 30, 40]) {
    for (let k = 0; k < 24; k++) {
      // sweep out from straight ahead, alternating sides: the nearest-to-centre spots first
      const a = (Math.ceil(k / 2) * (k % 2 ? 1 : -1) * Math.PI) / 12
      const x = r2(cx + Math.sin(a) * rad, 10), z = r2(cz - Math.cos(a) * rad, 10)
      if (Math.abs(x) <= LIMITS.at && Math.abs(z) <= LIMITS.at && clear(x, z)) return [x, z]
    }
  }
  return [r2(x1 + r + 2), cz]
}

/** the turn (deg, 5° steps) that faces a piece at `at` toward the master camera */
export const faceCamera = (at: [number, number]) =>
  Math.round(((Math.atan2(KIT_MASTER_POSITION[0] - at[0], KIT_MASTER_POSITION[2] - at[1]) * 180) / Math.PI) / 5) * 5

/** the label the replaced item carried (a built piece keeps the name it stood under; prompts name a piece by its label) */
const keptLabel = (o: KitItem) => (o.label !== undefined ? { label: o.label } : {})

/** the placement fields a rebuild keeps (prop-movement wave): a piece built again stands as it stood, tilted and travelling as saved */
const keptPlacement = (o: KitItem, ...keys: ('scale' | 'lift')[]) => ({
  ...(o.yawDeg !== undefined ? { yawDeg: o.yawDeg } : {}),
  ...(o.pitchDeg !== undefined ? { pitchDeg: o.pitchDeg } : {}),
  ...(o.rollDeg !== undefined ? { rollDeg: o.rollDeg } : {}),
  ...(o.move !== undefined ? { move: o.move } : {}),
  ...(keys.includes('scale') && o.scale !== undefined ? { scale: o.scale } : {}),
  ...(keys.includes('lift') && o.lift !== undefined ? { lift: o.lift } : {}),
})

/** The plan's kit with the built piece in it, and how it was placed. */
export function placePiece(plan: ScenePlan, item: KitItem): { kit: KitItem[]; placed: PieceRecord['placed'] } {
  const kit = [...plan.kit]
  const same = kit.findIndex((it) => it.glb && it.pieceTag === item.pieceTag)
  if (same >= 0) {
    const o = kit[same]
    kit[same] = { ...item, at: o.at, ...keptLabel(o), ...keptPlacement(o, 'scale', 'lift') }
    return { kit, placed: 'rebuilt' }
  }
  // the plan's stand-in for this very prop (propStandIns.ts: same pieceTag, no mesh yet) gives up its place, its turn and its
  // label (the name the user gave it, which the draw and the render say); its scale was a size guess, the mesh is sized by its kind
  const stand = kit.findIndex((it) => !it.glb && it.pieceTag !== undefined && it.pieceTag === item.pieceTag)
  if (stand >= 0) {
    const o = kit[stand]
    kit[stand] = { ...item, at: o.at, ...keptLabel(o), ...keptPlacement(o) }
    return { kit, placed: 'replaced' }
  }
  const match = kitMatch(kit, item.kind)
  if (match >= 0) {
    const o = kit[match]
    kit[match] = { ...item, at: o.at, ...keptPlacement(o) }
    return { kit, placed: 'replaced' }
  }
  const at = freeSpot(plan, pieceKindOf(item.kind).size)
  kit.push({ ...item, at, yawDeg: faceCamera(at) })
  return { kit, placed: 'free' }
}

/**
 * The built copy's kit (Reset the set) once the piece is in the live plan: placed the same way, except a stand-in the copy never
 * held (a prop added on the Stage after Build the set) — its mesh goes where the live plan put it, never over a planner piece.
 */
export function placeInCopy(copy: ScenePlan, item: KitItem, live: KitItem | null): KitItem[] {
  if (live && !copy.kit.some((it) => it.pieceTag === item.pieceTag)) return [...copy.kit, live]
  return placePiece(copy, item).kit
}

/** the largest side of a GLB's meshes in its own units, from the POSITION accessors' min/max (glTF requires them); null if unreadable */
export function glbExtent(buf: Buffer): number | null {
  try {
    if (buf.length < 20 || buf.toString('ascii', 0, 4) !== 'glTF') return null
    const len = buf.readUInt32LE(12)
    if (buf.toString('ascii', 16, 20) !== 'JSON') return null
    const j = JSON.parse(buf.toString('utf8', 20, 20 + len)) as { meshes?: { primitives?: { attributes?: { POSITION?: number } }[] }[]; accessors?: { min?: number[]; max?: number[] }[] }
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
    for (const mesh of j.meshes ?? []) for (const p of mesh.primitives ?? []) {
      const a = p.attributes?.POSITION === undefined ? undefined : j.accessors?.[p.attributes.POSITION]
      if (!a?.min || !a.max) continue
      for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], a.min[i]); hi[i] = Math.max(hi[i], a.max[i]) }
    }
    const e = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])
    return Number.isFinite(e) && e > 0 ? e : null
  } catch { return null }
}

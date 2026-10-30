/**
 * Where a lift's hive is, seen from the set (2026-10-25, wiring). The lift brings its own hive (liftProps.ts) at the wrists' pick, but
 * the Set knows nothing of the performance, so a set that already had a hive got a second one and the lift's hive was missing from the
 * Set's top view and its thin-set count. The rule, one for every view:
 *  - a hive piece of the set (a kit item whose kind, label or piece tag says hive) near the pick IS the lift's hive: Blocking places
 *    the pick at it when the lift is added (she walks up to it, facing it: `standBy`), and the performer builds no hive of its own;
 *  - with none near, the lift's own hive is drawn on the Set's top view and counted like a piece (`liftSpots` with `piece: -1`).
 * General: the words are the clip's own container ("lift a frame from a hive"), never a scene's. Pure (three.js only to measure a piece).
 */
import * as THREE from 'three'
import type { KitItem, PathAction } from '../contract.ts'
import { pieceOf } from '../kit.ts'

type Pt = [number, number]
/** metres the lift's hive centre stands ahead of the hips at the pick (motion.lift.test: ~0.36 m, the spike's measure) */
export const LIFT_REACH = 0.36
/** metres from the clicked point within which a set hive is taken as the one she lifts from */
export const SNAP_RADIUS = 3
/** metres between the hive a lift would bring and a set hive's edge within which the set's is used instead (no second hive) */
const COVER = 0.6
/** metres from her hips to the front of the box when she bends into it */
const BELLY = 0.15
const HIVE = /\b(?:bee)?hives?\b/i

/** a set piece that is a hive, by its own words */
export const isHivePiece = (it: Pick<KitItem, 'kind' | 'label' | 'pieceTag'>): boolean =>
  HIVE.test(`${it.kind} ${it.label ?? ''} ${(it.pieceTag ?? '').replace(/[:_-]+/g, ' ')}`)

const half = new Map<string, number>()
/** half the piece's footprint on the ground (metres, at its scale): a generated mesh is unit-sized, a kit shape is measured once */
export function halfSize(it: Pick<KitItem, 'kind' | 'args' | 'scale' | 'glb'>): number {
  const s = it.scale ?? 1
  if (it.glb) return 0.5 * (it.glb.unitScale ?? 1) * s
  const piece = pieceOf(it.kind)
  if (!piece) return 0.3 * s
  const args = piece.args.map((a, j) => it.args?.[j] ?? a.def), key = `${it.kind}:${args.join(',')}`
  if (!half.has(key)) {
    const size = new THREE.Box3().setFromObject(piece.build(...args)).getSize(new THREE.Vector3())
    half.set(key, Number.isFinite(size.x) ? Math.max(size.x, size.z) / 2 : 0.3)
  }
  return half.get(key)! * s
}

/** the set hive nearest `p` within `r` metres of its centre, or -1 */
export function hiveNear(kit: readonly KitItem[], p: Pt, r = SNAP_RADIUS): number {
  let best = -1, d = r
  kit.forEach((it, i) => { const k = Math.hypot(it.at[0] - p[0], it.at[1] - p[1]); if (isHivePiece(it) && k <= d) { best = i; d = k } })
  return best
}

/** where she stands to lift from `it`, coming from `from`: on the line to its centre, her front at its edge, facing it */
export function standBy(it: KitItem, from: Pt): Pt {
  let dx = it.at[0] - from[0], dz = it.at[1] - from[1]
  const L = Math.hypot(dx, dz)
  if (L < 1e-6) { dx = 0; dz = -1 } else { dx /= L; dz /= L }
  const D = halfSize(it) + BELLY, r = (v: number) => Math.round(v * 100) / 100
  return [r(it.at[0] - dx * D), r(it.at[1] - dz * D)]
}

/** the point `at` metres along the path and the way she walks there (arriving; leaving at the first point) */
function along(path: readonly Pt[], at: number): { p: Pt; dir: Pt } {
  let s = 0
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], L = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (L < 1e-9) continue
    const dir: Pt = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]
    if (at <= s + L + 1e-6) { const u = Math.max(0, at - s); return { p: [a[0] + dir[0] * u, a[1] + dir[1] * u], dir } }
    s += L
  }
  const a = path[path.length - 2] ?? path[0], b = path[path.length - 1] ?? [0, 0], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  return { p: b, dir: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] }
}

/** the set hive (kit index) a hive centred at `p` would double, or -1 */
export function setHiveAt(kit: readonly KitItem[], p: Pt): number {
  return kit.findIndex((it) => isHivePiece(it) && Math.hypot(it.at[0] - p[0], it.at[1] - p[1]) <= halfSize(it) + COVER)
}

/** every lift on the path: where its hive is and whether a set hive stands in for it (`piece` its kit index, else -1) */
export function liftSpots(path: readonly Pt[], actions: readonly PathAction[] | undefined, kit: readonly KitItem[]): { at: Pt; piece: number }[] {
  if (path.length < 2) return []
  return (actions ?? []).filter((a) => a.kind === 'lift').map((a) => {
    const { p, dir } = along(path, a.at), at: Pt = [p[0] + dir[0] * LIFT_REACH, p[1] + dir[1] * LIFT_REACH]
    return { at, piece: setHiveAt(kit, at) }
  })
}

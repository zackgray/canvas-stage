// How big a set piece may be made, and its size in metres (owner 2026-10-29: a grandstand built as a 3D piece sits tens of metres
// wide in the background, and the old 4x cap held it at 8 m). The plan's scale is a multiplier on the piece's own size (a generated
// mesh: unitScale metres per mesh unit; a kit piece: its builder's metres); the Stage lets it grow until its largest side reaches
// MAX_PIECE_M, inside the plan's sanity bound (LIMITS.scale). Pure, but for meshExtent, which reads a built piece's own meshes.
import { Box3, Matrix4, type Mesh, type Object3D } from 'three'
import type { KitItem } from '../../stage3d/contract'
import { LIMITS } from '../../stage3d/planRules'
import { pieceLocalBox } from '../stage/moves/pieces'

/** the largest a set piece is made on the Stage, metres along its longest side */
export const MAX_PIECE_M = 100

export type Size3 = [w: number, h: number, d: number]

/** the piece's width (its own x), height and depth (its own z) in metres at scale 1, from the plan alone; null for an unknown kind */
export function baseSizeOf(it: KitItem): Size3 | null {
  const b = pieceLocalBox(it)
  if (!b) return null
  const s: Size3 = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]
  return s.every((v) => Number.isFinite(v) && v >= 0) ? s : null
}

/** the scales this piece may take: the plan's lower bound, up to MAX_PIECE_M on its longest side (never under its current scale) */
export function scaleRangeOf(it: KitItem): [number, number] {
  const [lo, hi] = LIMITS.scale
  const base = baseSizeOf(it), longest = base ? Math.max(...base) : 0
  const top = longest > 0 ? Math.floor((MAX_PIECE_M / longest) * 100) / 100 : hi
  return [lo, Math.max(lo, Math.min(hi, Math.max(top, it.scale ?? 1)))]
}

/** a requested scale held to the piece's range, to the plan's 2 decimals */
export function clampScale(it: KitItem, v: number): number {
  const [lo, hi] = scaleRangeOf(it)
  return Math.min(hi, Math.max(lo, Math.round(v * 100) / 100))
}

/**
 * A built piece's own extent in its root's units (its turn and size left out: the meshes measured in the root's frame), from the
 * visible meshes (a generated piece's precise mesh, not its hidden massing); null when it has none yet.
 */
export function meshExtent(root: Object3D): Size3 | null {
  root.updateMatrixWorld(true)
  const inv = new Matrix4().copy(root.matrixWorld).invert(), box = new Box3(), part = new Box3(), m = new Matrix4()
  root.traverseVisible((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
    box.union(part.copy(mesh.geometry.boundingBox!).applyMatrix4(m.multiplyMatrices(inv, mesh.matrixWorld)))
  })
  if (box.isEmpty()) return null
  return [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z]
}

/** the piece's size now, metres: its built meshes when given (exact), else the plan's own estimate; null when neither knows */
export function sizeOf(it: KitItem, root?: Object3D | null): Size3 | null {
  const s = it.scale ?? 1
  const own = root ? meshExtent(root) : null
  if (own) { const k = (it.glb?.unitScale ?? 1) * s; return [own[0] * k, own[1] * k, own[2] * k] }
  const base = baseSizeOf(it)
  return base ? [base[0] * s, base[1] * s, base[2] * s] : null
}

const m1 = (v: number) => (v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10))

/** "28 × 14 m, 9 m tall" */
export const sizeWords = ([w, h, d]: Size3): string => `${m1(w)} × ${m1(d)} m, ${m1(h)} m tall`

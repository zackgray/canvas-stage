// The actors of one frame as a displaced grid from the source camera (pure): math/grid.ts's buildGrid over the actor
// crop (actor-only depth, so everything else is cut, and triangles across a depth edge — a limb before the torso — are
// cut too), shifted back to where the crop sits in the full frame, and compacted to the vertices the triangles use.
//
// The crop as its own pinhole: same focal and principal ray spacing, so its vfov spans h/H of the full frame's image
// plane. A crop pixel (px, py) unprojected that way differs from the full-frame pixel (px + x0, py + y0) only by an
// offset proportional to depth: x += a·d, y += b·d with a = (2·x0 + w − W)/H · tan(vfov/2), b = (H − 2·y0 − h)/H · tan(vfov/2).
// UVs stay crop-relative (0,0 bottom-left), matching the crop's texture.
import { toRad } from '../math/camera'
import { buildGrid } from '../math/grid'
import { cropMetres, type ActorCrop } from './decode'

/** a triangle whose depths differ by more than this (relative) is cut: E26's 1.08 max/min ratio */
export const ACTOR_EDGE = 0.08

export interface FullFrame { width: number; height: number; vfovDeg: number }

export interface ActorGeometry {
  /** source-camera space (three.js: looks down -Z) */
  positions: Float32Array
  uvs: Float32Array
  indices: Uint32Array
  triangles: number
}

export const geometryBytes = (g: ActorGeometry) => g.positions.byteLength + g.uvs.byteLength + g.indices.byteLength

const EMPTY: ActorGeometry = { positions: new Float32Array(0), uvs: new Float32Array(0), indices: new Uint32Array(0), triangles: 0 }

export function actorGeometry(crop: ActorCrop, full: FullFrame, step = 1, edge = ACTOR_EDGE): ActorGeometry {
  const { x0, y0, w, h } = crop
  if (w < 2 || h < 2) return EMPTY
  const ty = Math.tan(toRad(full.vfovDeg) / 2)
  const k = { width: w, height: h, vfov: 2 * Math.atan((ty * h) / full.height) }
  const g = buildGrid(k, cropMetres(crop), { step, edgeThreshold: edge, planeAware: false })
  if (!g.indices.length) return EMPTY
  const a = ((2 * x0 + w - full.width) / full.height) * ty
  const b = ((full.height - 2 * y0 - h) / full.height) * ty
  const remap = new Int32Array(g.cols * g.rows).fill(-1)
  let n = 0
  for (const v of g.indices) if (remap[v] < 0) remap[v] = n++
  const positions = new Float32Array(n * 3)
  const uvs = new Float32Array(n * 2)
  for (let v = 0; v < remap.length; v++) {
    const o = remap[v]
    if (o < 0) continue
    const d = -g.positions[v * 3 + 2]
    positions[o * 3] = g.positions[v * 3] + a * d
    positions[o * 3 + 1] = g.positions[v * 3 + 1] + b * d
    positions[o * 3 + 2] = -d
    uvs[o * 2] = g.uvs[v * 2]
    uvs[o * 2 + 1] = g.uvs[v * 2 + 1]
  }
  const indices = g.indices.map((v) => remap[v])
  return { positions, uvs, indices, triangles: indices.length / 3 }
}

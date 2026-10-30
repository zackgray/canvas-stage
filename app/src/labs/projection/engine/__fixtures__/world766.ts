// The 766 fixture world (A5 acceptance): COPIES of loc-2026-10-21T20-27-13-766's still, MoGe depth, level.json, meta.json and
// surround distance, plus four frames (depth + mask) of the E78 soldier pack. The fixture meta.json carries a `surround.floor`
// written by A2's scripts/surround_floor.py on the copied surround-dist.png (4.814 app units down, 3.4 deg tilt), and the
// pack manifest the E78 floor pin against the world's floor (k 1.431; 1.482 on the plate's) in the A0 `pin` shape. Node-only helpers (fs).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PerspectiveCamera, Vector3 } from 'three'
import { buildGrid, type GridMesh } from '../../math/grid'
import { decodePng, type PngImage } from '../../math/png'
import { toDepth } from '../../math/depth'
import { PROJECTOR_POSITION, PROJECTOR_TARGET } from '../stageScene'

export const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'world766')
export const readFixture = (name: string) => new Uint8Array(readFileSync(path.join(FIXTURE, name)))
export const fixtureJson = <T = Record<string, unknown>>(name: string): T => JSON.parse(readFileSync(path.join(FIXTURE, name), 'utf8')) as T
export const fixturePng = (name: string): Promise<PngImage> => decodePng(readFixture(name))

/** the stage's projector pose (stageScene.ts), as a bare camera */
export function projectorCamera(vfovDeg: number, aspect: number): PerspectiveCamera {
  const p = new PerspectiveCamera(vfovDeg, aspect, 0.02, 2000)
  p.position.copy(PROJECTOR_POSITION)
  p.lookAt(PROJECTOR_TARGET)
  p.updateMatrixWorld(true)
  return p
}

/** The set's displaced grid as the lab builds it (linear metres, the lab's grid defaults), at the meta's lens. */
export async function setGrid(meta: { lens: { vfovDeg: number }; depth: { metersPerUnit: number } }): Promise<GridMesh> {
  const png = await fixturePng('depth-moge-2.png')
  const values = new Float32Array(png.width * png.height)
  for (let i = 0; i < values.length; i++) values[i] = png.data[i * png.channels] / 65535
  const depth = toDepth({ width: png.width, height: png.height, values }, 'near-dark', { mode: 'linear', scale: meta.depth.metersPerUnit * 65535, shift: 0 })
  return buildGrid({ width: png.width, height: png.height, vfov: (meta.lens.vfovDeg * Math.PI) / 180 }, depth, { step: 2, edgeThreshold: 0.04, planeAware: true, grazeDeg: 86 })
}

/** A seeded RANSAC plane through `pts` (|n|=1, n·p + d = 0, n pointing toward +`hint`), LS-refined on the inliers. */
export function fitPlane(pts: Vector3[], tol: (p: Vector3) => number, hint: Vector3, iters = 400): { n: Vector3; d: number; inliers: number } {
  let seed = 12345
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  let best = { n: new Vector3(), d: 0, share: -1 }
  for (let k = 0; k < iters; k++) {
    const [a, b, c] = [0, 1, 2].map(() => pts[Math.floor(rnd() * pts.length)])
    const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a))
    if (n.lengthSq() < 1e-12) continue
    n.normalize()
    if (n.dot(hint) < 0) n.negate()
    if (n.dot(hint) < 0.8) continue
    const d = -n.dot(a)
    let inl = 0
    for (const p of pts) if (Math.abs(n.dot(p) + d) < tol(p)) inl++
    if (inl > best.share) best = { n, d, share: inl }
  }
  // least squares on the inliers: the normal is the covariance's smallest-variance direction
  const inl = pts.filter((p) => Math.abs(best.n.dot(p) + best.d) < tol(p))
  const c = inl.reduce((s, p) => s.add(p), new Vector3()).multiplyScalar(1 / inl.length)
  const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  for (const p of inl) {
    const q = [p.x - c.x, p.y - c.y, p.z - c.z]
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i * 3 + j] += q[i] * q[j]
  }
  // power iteration on (tr·I - cov), whose largest eigenvector is cov's smallest, from the RANSAC normal
  const n = best.n.clone()
  const tr = cov[0] + cov[4] + cov[8]
  for (let it = 0; it < 50; it++) {
    const v = [n.x, n.y, n.z]
    const w = [0, 1, 2].map((i) => tr * v[i] - (cov[i * 3] * v[0] + cov[i * 3 + 1] * v[1] + cov[i * 3 + 2] * v[2]))
    n.set(w[0], w[1], w[2]).normalize()
  }
  if (n.dot(hint) < 0) n.negate()
  return { n, d: -n.dot(c), inliers: inl.length / pts.length }
}

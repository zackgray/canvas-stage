// Test helpers: synthetic planar depth of planes seen from a camera (exact, analytic), as the projector would see a set.
import { Quaternion, Vector3, Matrix4 } from 'three'
import { add, dot, mul, rotate, sub, type Cam, type Plane, type Q4, type V3 } from './geom'
import type { DepthView } from './ground'

/** A camera like the stage's projector: at (0, 1.6, 0) looking at (0, 1, -8), 16:9. */
export function projectorCam(width = 160, height = 90, vfovDeg = 40): Cam {
  const m = new Matrix4().lookAt(new Vector3(0, 1.6, 0), new Vector3(0, 1, -8), new Vector3(0, 1, 0))
  const q = new Quaternion().setFromRotationMatrix(m).toArray() as Q4
  return { position: [0, 1.6, 0], quaternion: q, vfovDeg, width, height }
}

/** A plane patch: the plane, and an optional test that the hit point is on the patch. */
export interface Surface { plane: Plane; keep?: (p: V3) => boolean }

/** Planar depth of the nearest surface under every pixel (0 = nothing), plus seeded noise of ±`noise` m. */
export function depthOf(cam: Cam, surfaces: Surface[], noise = 0, seed = 7): DepthView {
  let s = seed >>> 0
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1
  const { width: W, height: H } = cam
  const th = Math.tan((cam.vfovDeg * Math.PI) / 360)
  const depth = new Float32Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const local: V3 = [((2 * (x + 0.5)) / W - 1) * th * (W / H), (1 - (2 * (y + 0.5)) / H) * th, -1] // planar depth 1
    const dir = rotate(cam.quaternion, local)
    let best = Infinity
    for (const f of surfaces) {
      const den = dot(f.plane.n, dir)
      if (Math.abs(den) < 1e-9) continue
      const t = -(dot(f.plane.n, cam.position) + f.plane.d) / den
      if (!(t > 0) || t >= best) continue
      if (f.keep && !f.keep(add(cam.position, mul(dir, t)))) continue
      best = t
    }
    depth[y * W + x] = Number.isFinite(best) && best < 200 ? best + noise * rnd() : 0
  }
  return { depth, cam }
}

export const GROUND: Plane = { n: [0, 1, 0], d: 0 }
/** A facade across the end of the street, 12 m out. */
export const FACADE: Surface = { plane: { n: [0, 0, 1], d: 12 } }

/** A ground plane through `p` tilted `deg` about X (rising away from the camera). */
export function tilted(deg: number, p: V3 = [0, 0, 0]): Plane {
  const a = (deg * Math.PI) / 180
  const n: V3 = [0, Math.cos(a), Math.sin(a)]
  return { n, d: -dot(n, p) }
}

export const angleDeg = (a: V3, b: V3) => (Math.acos(Math.min(1, Math.abs(dot(a, b)))) * 180) / Math.PI
export const dist = (a: V3, b: V3) => Math.hypot(...sub(a, b))

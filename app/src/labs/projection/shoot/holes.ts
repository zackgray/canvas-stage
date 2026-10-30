// What fraction of the current view is a real hole (no geometry, and not sky). Pure, unit-tested.
//
// A pixel with no depth is either sky (the source still had no depth there: MoGe/DA mark sky invalid) or a hole the
// projector cannot see. Sky sits at infinity, so only rotation matters: a view ray is sky when, turned into the
// projector's frame, it lands inside the still on a pixel whose source depth is invalid. Rays that leave the still's
// frame or point behind the projector count as holes (there is nothing there yet).

export type Quat = readonly [number, number, number, number]

export interface CamSpec {
  /** world rotation (three.js order x, y, z, w); camera looks down -z, +y up */
  quaternion: Quat
  vfovDeg: number
  /** width / height */
  aspect: number
}

export interface SourceDepth {
  /** planar depth, top row first; non-positive / non-finite = no depth (sky) */
  depth: Float32Array
  width: number
  height: number
}

export interface HoleStats {
  total: number
  holes: number
  sky: number
  /** non-sky holes over all pixels */
  fraction: number
}

/** Rotate v by unit quaternion q (x, y, z, w). */
function rotate(q: Quat, v: [number, number, number], inverse = false): [number, number, number] {
  const [qx, qy, qz] = inverse ? [-q[0], -q[1], -q[2]] : [q[0], q[1], q[2]]
  const qw = q[3]
  // t = 2 q × v ; v' = v + w t + q × t
  const tx = 2 * (qy * v[2] - qz * v[1])
  const ty = 2 * (qz * v[0] - qx * v[2])
  const tz = 2 * (qx * v[1] - qy * v[0])
  return [
    v[0] + qw * tx + (qy * tz - qz * ty),
    v[1] + qw * ty + (qz * tx - qx * tz),
    v[2] + qw * tz + (qx * ty - qy * tx),
  ]
}

const validDepth = (d: number) => d > 0 && Number.isFinite(d)

/** `depth`: the view's rendered planar depth (top row first, 0 = nothing drawn) at width × height. */
export function holeStats(depth: Float32Array, width: number, height: number, view: CamSpec, projector: CamSpec, src: SourceDepth | null): HoleStats {
  const ty = Math.tan((view.vfovDeg * Math.PI) / 360)
  const tx = ty * view.aspect
  const pty = Math.tan((projector.vfovDeg * Math.PI) / 360)
  const ptx = pty * projector.aspect
  let holes = 0
  let sky = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (validDepth(depth[y * width + x])) continue
      if (src && isSky(x, y)) sky++
      else holes++
    }
  }
  const total = width * height
  return { total, holes, sky, fraction: total ? holes / total : 0 }

  function isSky(x: number, y: number): boolean {
    const cam: [number, number, number] = [((x + 0.5) / width * 2 - 1) * tx, (1 - (y + 0.5) / height * 2) * ty, -1]
    const p = rotate(projector.quaternion, rotate(view.quaternion, cam), true)
    if (p[2] >= -1e-9) return false
    const u = p[0] / -p[2] / ptx
    const v = p[1] / -p[2] / pty
    if (Math.abs(u) > 1 || Math.abs(v) > 1) return false
    const col = Math.min(src!.width - 1, Math.floor(((u + 1) / 2) * src!.width))
    const row = Math.min(src!.height - 1, Math.floor(((1 - v) / 2) * src!.height))
    return !validDepth(src!.depth[row * src!.width + col])
  }
}

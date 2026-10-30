// Where the actors are over a whole clip (pure): the orbit rig's Performance pivot. Each frame's actor pixels are
// unprojected from the source camera (planar depth) and averaged; the clip's centre is the per-axis median of those
// frame centres, so it is one fixed point for the clip (no per-frame jitter) and a few bad frames cannot drag it.
// Height comes out as the actors' mean height (mid-body, chest-ish for standing figures).
import { Vector3 } from 'three'
import { toRad } from '../math/camera'
import type { ActorCrop } from './decode'
import type { FullFrame } from './actorMesh'

/** actor pixels sampled per frame, at most (a stride over the crop keeps big crops cheap) */
const SAMPLES = 2500

/** Mean actor point of one frame, in source-camera space (looks down -Z); null when the frame has no actors. */
export function frameCentre(crop: ActorCrop, full: FullFrame): Vector3 | null {
  const { x0, y0, w, h, depth, metersPerUnit } = crop
  if (!w || !h) return null
  const ty = Math.tan(toRad(full.vfovDeg) / 2)
  const W = full.width, H = full.height
  const stride = Math.max(1, Math.ceil(Math.sqrt((w * h) / SAMPLES)))
  let sx = 0, sy = 0, sz = 0, n = 0
  for (let y = 0; y < h; y += stride) for (let x = 0; x < w; x += stride) {
    const raw = depth[y * w + x]
    if (!raw) continue
    const d = raw * metersPerUnit
    const u = x0 + x + 0.5, v = y0 + y + 0.5
    sx += ((2 * u - W) / H) * ty * d
    sy += ((H - 2 * v) / H) * ty * d
    sz -= d
    n++
  }
  return n ? new Vector3(sx / n, sy / n, sz / n) : null
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** The clip's actor centre in source-camera space: per-axis median of the frame centres; null without actors. */
export function actorCentre(crops: readonly ActorCrop[], full: FullFrame): Vector3 | null {
  const cs = crops.map((c) => frameCentre(c, full)).filter((c): c is Vector3 => !!c)
  if (!cs.length) return null
  return new Vector3(median(cs.map((c) => c.x)), median(cs.map((c) => c.y)), median(cs.map((c) => c.z)))
}

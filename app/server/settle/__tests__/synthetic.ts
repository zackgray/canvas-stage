// A small synthetic settle scene: a back wall with a nearer box, sky across the top rows, a hole in the middle.
// MoGe's view of it is off by a known scale and rendered as normalised inverse depth, with a matching point map.
import { encodeInverse16 } from '../../../src/labs/projection/math/depth.ts'

export const W = 64, H = 48, VFOV = 40
export const F = H / 2 / Math.tan((VFOV * Math.PI) / 360)
export const NEAR = 1, FAR = 50
/** MoGe's depth is the truth divided by this; alignment must recover it */
export const MOGE_SCALE_ERR = 1.3
/** MoGe render: e = (1/z - B) / A */
export const A = 2, B = 0.01
export const SKY_ROWS = 6

export function scene() {
  const truth = new Float32Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const box = x >= 36 && x < 52 && y >= 20 && y < 40
      truth[y * W + x] = y < SKY_ROWS ? NaN : box ? 4 : 8 + 0.03 * x
    }
  }
  const holes = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x >= 12 && x < 28 && y >= 2 && y < 30) holes[y * W + x] = 1
  // the set has no geometry in its holes or in the sky
  const setDepth = truth.map((d, i) => (holes[i] ? NaN : d))
  const refRaw = encodeInverse16(setDepth, NEAR, FAR)

  const values = new Float32Array(W * H)
  const valid = new Float32Array(W * H)
  const pos: number[] = [], uv: number[] = []
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const z = truth[i] / MOGE_SCALE_ERR
      if (!(z > 0)) { values[i] = 0; valid[i] = 0; continue }
      valid[i] = 1
      values[i] = (1 / z - B) / A
      // pixel centre convention of fitInverse: uv * size - 0.5 = pixel index
      pos.push(((x - W / 2) * z) / F, (-(y - H / 2) * z) / F, -z)
      uv.push((x + 0.5) / W, (y + 0.5) / H)
    }
  }
  return {
    truth, holes, refRaw,
    moge: { width: W, height: H, values },
    mogeValid: valid,
    points: { positions: new Float32Array(pos), uvs: new Float32Array(uv) },
  }
}

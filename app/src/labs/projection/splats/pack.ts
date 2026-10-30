// Converter output -> Spark's splat buffers. Spark takes LINEAR opacity in [0, 1] (see splatMath).

import { ExtSplats, PackedSplats, utils } from '@sparkjsdev/spark'
import type { DepthSplats } from './fromDepth'

/** Pack converter output into Spark's buffers (capacity rounded up to Spark's texture layout). */
export function pack(s: DepthSplats, packed: boolean): { source: PackedSplats | ExtSplats; bytes: number } {
  const cap = utils.computeMaxSplats(Math.max(1, s.count))
  const { centers: p, scales: k, quaternions: q, colors: c, opacities: a } = s
  const op = (i: number) => Math.min(1, Math.max(0, a[i])) // > 1 means something else to Spark's shader
  if (packed) {
    const arr = new Uint32Array(cap * 4)
    for (let i = 0; i < s.count; i++) {
      const i3 = i * 3, i4 = i * 4
      utils.setPackedSplat(arr, i, p[i3], p[i3 + 1], p[i3 + 2], k[i3], k[i3 + 1], k[i3 + 2],
        q[i4], q[i4 + 1], q[i4 + 2], q[i4 + 3], op(i), c[i3] / 255, c[i3 + 1] / 255, c[i3 + 2] / 255)
    }
    return { source: new PackedSplats({ packedArray: arr, numSplats: s.count }), bytes: arr.byteLength }
  }
  const ext: [Uint32Array, Uint32Array] = [new Uint32Array(cap * 4), new Uint32Array(cap * 4)]
  for (let i = 0; i < s.count; i++) {
    const i3 = i * 3, i4 = i * 4
    utils.encodeExtSplat(ext, i, p[i3], p[i3 + 1], p[i3 + 2], k[i3], k[i3 + 1], k[i3 + 2],
      q[i4], q[i4 + 1], q[i4 + 2], q[i4 + 3], op(i), c[i3] / 255, c[i3 + 1] / 255, c[i3 + 2] / 255)
  }
  return { source: new ExtSplats({ extArrays: ext, numSplats: s.count }), bytes: ext[0].byteLength * 2 }
}

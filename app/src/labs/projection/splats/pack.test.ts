import { describe, expect, it } from 'vitest'
import { ExtSplats, PackedSplats, utils } from '@sparkjsdev/spark'
import { depthToSplats } from './fromDepth'
import { pack } from './pack'
import { sigmoid, toPlyOpacity } from './splatMath'

const W = 20
const H = 12
const depth = new Float32Array(W * H).map((_, i) => 2 + 0.05 * (i % W) + 0.03 * Math.floor(i / W))
const rgba = new Uint8Array(W * H * 4).map((_, i) => (i * 13) % 256)
const splats = (opacity: number) => depthToSplats({ rgba, depth, width: W, height: H, vfov: 0.9 }, { opacity })

describe('opacity convention', () => {
  it('Spark reads back the linear opacity we asked for (ext and packed)', () => {
    for (const a of [1, 0.5, 0.1]) {
      const s = splats(a)
      const ext = pack(s, false).source as ExtSplats
      const packed = pack(s, true).source as PackedSplats
      for (const i of [0, 7, s.count - 1]) {
        expect(utils.decodeExtSplat(ext.extArrays, i).opacity).toBeCloseTo(a, 3)
        expect(utils.unpackSplat(packed.packedArray!, i).opacity).toBeCloseTo(a, 2)
      }
    }
  })

  it('.ply opacity is the logit: sigmoid(toPlyOpacity(a)) = a, and a raw 1.0 would read back as 0.73', () => {
    for (const a of [0.01, 0.1, 0.5, 0.9, 0.999]) expect(sigmoid(toPlyOpacity(a))).toBeCloseTo(a, 9)
    expect(toPlyOpacity(1)).toBeGreaterThan(10)
    expect(sigmoid(1)).toBeCloseTo(0.731, 3) // WorldGen's bug
  })
})

describe('packing for Spark', () => {
  it('round-trips centres, scales, rotation and colour', () => {
    const s = splats(1)
    const { source, bytes } = pack(s, false)
    const ext = source as ExtSplats
    expect(ext.numSplats).toBe(s.count)
    expect(bytes).toBe(utils.computeMaxSplats(s.count) * 32)
    for (const i of [0, 33, s.count - 1]) {
      const u = utils.decodeExtSplat(ext.extArrays, i)
      expect(u.center.x).toBe(s.centers[i * 3]) // float32 centres: exact
      expect(u.center.z).toBe(s.centers[i * 3 + 2])
      expect(u.scales.y / s.scales[i * 3 + 1]).toBeCloseTo(1, 2)
      const q = s.quaternions.subarray(i * 4, i * 4 + 4)
      const dot = Math.abs(u.quaternion.x * q[0] + u.quaternion.y * q[1] + u.quaternion.z * q[2] + u.quaternion.w * q[3])
      expect(dot).toBeGreaterThan(0.999)
      expect(u.color.r).toBeCloseTo(s.colors[i * 3] / 255, 2)
    }
  })

  it('packed mode is half the bytes, half-float centres', () => {
    const s = splats(1)
    const { source, bytes } = pack(s, true)
    expect(bytes).toBe(utils.computeMaxSplats(s.count) * 16)
    const u = utils.unpackSplat((source as PackedSplats).packedArray!, 5)
    expect(u.center.z).toBeCloseTo(s.centers[5 * 3 + 2], 2)
  })
})

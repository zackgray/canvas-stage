import type { Texture } from 'three'
import { describe, expect, it } from 'vitest'
import type { BankDepth } from '../engine/manifest'
import { defaultParams } from '../math/depth'
import { plateLens, plateSource, type Plate } from './plate'

const MPU = 0.0002937965337768285
const entry: BankDepth = { model: 'moge-2-vitl', path: '/d.png', convention: 'near-dark', bitDepth: 16, metersPerUnit: MPU, metric: true, fovDeg: 50.38 }
const plate: Plate = {
  packId: 'warehouse-fight', locationId: 'loc-x', texture: {} as Texture, metres: Float32Array.from([3.5, NaN, 8.82, 19.25]),
  width: 2, height: 2, vfovDeg: 47.79, aspect: 960 / 544,
}
const params = defaultParams('linear', MPU * 65535) // what the lab starts a 16-bit metric map with (ui/settings paramsForEntry)

describe('plateSource', () => {
  it('maps the plate metres through the location map\'s depth settings back to the same metres', () => {
    const s = plateSource(plate, entry, params, { sharpen: 0, edge: 0.04 }, { width: 1920, height: 1088 })!
    expect(s.depth[0]).toBeCloseTo(3.5, 4)
    expect(Number.isNaN(s.depth[1])).toBe(true)
    expect(s.depth[2]).toBeCloseTo(8.82, 4)
    expect(s.depth[3]).toBeCloseTo(19.25, 3)
    expect([s.depthWidth, s.depthHeight, s.width, s.height]).toEqual([2, 2, 1920, 1088])
  })

  it('moves with a depth scale the user set, like the location map does', () => {
    const s = plateSource(plate, entry, { ...params, scale: params.scale * 2 }, { sharpen: 0, edge: 0.04 }, { width: 2, height: 2 })!
    expect(s.depth[0]).toBeCloseTo(7, 4)
  })

  it('is not offered over a non-metric map', () => {
    expect(plateSource(plate, { ...entry, metric: false, metersPerUnit: undefined } as BankDepth, params, { sharpen: 0, edge: 0.04 }, { width: 2, height: 2 })).toBeNull()
    expect(plateSource(plate, undefined, params, { sharpen: 0, edge: 0.04 }, { width: 2, height: 2 })).toBeNull()
  })
})

describe('plateLens', () => {
  it('is the pack camera', () => {
    const l = plateLens(plate)
    expect(l.vfovDeg).toBe(47.79)
    expect(l.focalMm).toBeCloseTo(36 / (960 / 544) / (2 * Math.tan((47.79 * Math.PI) / 360)), 6)
  })
})

import { describe, expect, it } from 'vitest'
import { depthMetres, framePath, MAX_FRAMES, packUrl, parsePerformance, PerformanceShapeError, type PerformancePack } from '../performance.ts'

const PACK: PerformancePack = {
  id: 'warehouse-fight', label: 'Warehouse fight', locationId: 'loc-2026-10-19T12-00-00-000', fps: 24, frames: 97,
  width: 960, height: 544,
  source: { vfovDeg: 50.38, aspect: 960 / 544, position: [0, 1.6, 0], quaternion: [-0.0374, 0, 0, 0.9993] },
  depth: { encoding: 'planar-metres-16bit', metersPerUnit: 0.0002 },
  files: { color: 'frames/color_%03d.png', depth: 'frames/depth_%03d.png', mask: 'frames/mask_%03d.png' },
  sourceClip: 'source.mp4', background: 'background.png', prompt: 'Two men grapple in a warehouse.',
}
const norm = Math.hypot(...PACK.source.quaternion)
PACK.source.quaternion = PACK.source.quaternion.map((q) => q / norm) as PerformancePack['source']['quaternion']

const text = (patch: (p: Record<string, any>) => void = () => {}) => {
  const p = JSON.parse(JSON.stringify(PACK))
  patch(p)
  return JSON.stringify(p)
}
const rejects = (patch: (p: Record<string, any>) => void, field: RegExp) => {
  expect(() => parsePerformance(text(patch))).toThrow(PerformanceShapeError)
  expect(() => parsePerformance(text(patch))).toThrow(field)
}

describe('parsePerformance', () => {
  it('reads an optional plate depth and refuses one outside the pack', () => {
    const withPlate = { ...PACK, backgroundDepth: { file: 'background_depth.png', metersPerUnit: 0.0003 } }
    expect(parsePerformance(JSON.stringify(withPlate))).toEqual(withPlate)
    expect('backgroundDepth' in parsePerformance(JSON.stringify(PACK))).toBe(false)
    rejects((p) => { p.backgroundDepth = { file: '../x.png', metersPerUnit: 0.0003 } }, /backgroundDepth\.file/)
    rejects((p) => { p.backgroundDepth = { file: 'background_depth.png', metersPerUnit: 0 } }, /backgroundDepth\.metersPerUnit/)
  })

  it('round-trips a pack exactly', () => {
    const p = parsePerformance(JSON.stringify(PACK))
    expect(p).toEqual(PACK)
    expect(parsePerformance(JSON.stringify(p))).toEqual(PACK)
  })

  it('drops unknown fields', () => {
    expect(parsePerformance(text((p) => { p.extra = 1; p.depth.note = 'x' }))).toEqual(PACK)
  })

  it('rejects text that is not JSON', () => {
    expect(() => parsePerformance('<html>')).toThrow(/not JSON/)
  })

  it('rejects any depth encoding but planar metres', () => {
    rejects((p) => { p.depth.encoding = 'inverse-16bit' }, /depth.encoding/)
    rejects((p) => { delete p.depth.encoding }, /depth.encoding/)
    rejects((p) => { p.depth.metersPerUnit = 0 }, /depth.metersPerUnit/)
    rejects((p) => { p.depth.metersPerUnit = 'x' }, /depth.metersPerUnit/)
  })

  it('rejects paths that leave the pack or are not frame patterns', () => {
    rejects((p) => { p.files.color = '../other/color_%03d.png' }, /files.color/)
    rejects((p) => { p.files.color = '/lab-assets/color_%03d.png' }, /files.color/)
    rejects((p) => { p.files.depth = 'frames/depth.png' }, /files.depth/)
    rejects((p) => { p.files.mask = 'frames/mask_%03d_%03d.png' }, /files.mask/)
    rejects((p) => { p.files.mask = 'frames/mask_%d.png' }, /files.mask/)
    rejects((p) => { p.files.color = 'frames\\color_%03d.png' }, /files.color/)
    rejects((p) => { p.files.color = 'https://x.test/color_%03d.png' }, /files.color/)
    rejects((p) => { p.files.depth = 'frames/depth_%03d.exr' }, /files.depth/)
    rejects((p) => { p.sourceClip = '../../secret.mp4' }, /sourceClip/)
    rejects((p) => { p.background = 'a//b.png' }, /background/)
    rejects((p) => { p.background = 'bg_%03d.png' }, /background/)
  })

  it('accepts a long take up to the Lift ceiling (289 f), refuses past it', () => {
    expect(MAX_FRAMES).toBe(289)
    expect(parsePerformance(JSON.stringify({ ...PACK, frames: 289 })).frames).toBe(289)
    expect(() => parsePerformance(JSON.stringify({ ...PACK, frames: 290 }))).toThrow(/frames/)
  })

  it('rejects bad ids, sizes, frame counts and cameras', () => {
    rejects((p) => { p.id = 'Warehouse Fight' }, /performance.id/)
    rejects((p) => { p.id = '../x' }, /performance.id/)
    rejects((p) => { p.locationId = 'a/b' }, /locationId/)
    rejects((p) => { p.frames = 0 }, /frames/)
    rejects((p) => { p.frames = 500 }, /frames/)
    rejects((p) => { p.frames = MAX_FRAMES + 1 }, /frames/)
    rejects((p) => { p.frames = 9.5 }, /frames/)
    rejects((p) => { p.fps = 0 }, /fps/)
    rejects((p) => { p.width = 99999 }, /width/)
    rejects((p) => { p.source.aspect = 1 }, /source.aspect/)
    rejects((p) => { p.source.quaternion = [0, 0, 0, 2] }, /quaternion/)
    rejects((p) => { p.source.position = [0, 1] }, /position/)
    rejects((p) => { p.source.vfovDeg = 200 }, /vfovDeg/)
    rejects((p) => { p.prompt = 3 }, /prompt/)
  })
})

describe('pack helpers', () => {
  it('numbers frames from 0 with the pattern width', () => {
    expect(framePath('frames/color_%03d.png', 0)).toBe('frames/color_000.png')
    expect(framePath('frames/color_%03d.png', 96)).toBe('frames/color_096.png')
    expect(framePath('d_%05d.png', 7)).toBe('d_00007.png')
  })

  it('builds URLs only inside a pack', () => {
    expect(packUrl('warehouse-fight', 'frames/color_000.png')).toBe('/lab-assets/performances/warehouse-fight/frames/color_000.png')
    expect(() => packUrl('warehouse-fight', '../x.png')).toThrow(PerformanceShapeError)
    expect(() => packUrl('..', 'x.png')).toThrow(PerformanceShapeError)
  })

  it('decodes depth samples as planar metres, 0 = no actor', () => {
    expect(depthMetres(0, PACK)).toBeNaN()
    expect(depthMetres(25000, PACK)).toBeCloseTo(5, 6)
  })
})

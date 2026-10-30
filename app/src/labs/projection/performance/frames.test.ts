import { describe, expect, it } from 'vitest'
import { frameAt, frameTime, matchesSet, parseIndex, performanceDuration } from './frames'

describe('the performance frame for world time', () => {
  const pack = { fps: 24, frames: 97 }

  it('frame = round(t·fps): frame i exactly at i/fps, the nearest frame between', () => {
    for (let i = 0; i < pack.frames; i++) expect(frameAt(frameTime(i, pack), pack)).toBe(i)
    expect(frameAt(10.4 / 24, pack)).toBe(10)
    expect(frameAt(10.6 / 24, pack)).toBe(11)
  })

  it('holds the first frame before 0 and the last frame after the end', () => {
    expect(frameAt(-1, pack)).toBe(0)
    expect(frameAt(96 / 24, pack)).toBe(96)
    expect(frameAt(performanceDuration(pack), pack)).toBe(96)
    expect(frameAt(60, pack)).toBe(96)
  })

  it('follows the pack fps, not the clip guide\'s 24', () => {
    const p12 = { fps: 12, frames: 24 }
    expect(frameAt(1, p12)).toBe(12)
    expect(frameAt(0.5, { fps: 30, frames: 90 })).toBe(15)
    expect(performanceDuration(p12)).toBe(2)
  })

  it('an empty pack shows nothing; a non-finite time shows frame 0', () => {
    expect(frameAt(1, { fps: 24, frames: 0 })).toBe(-1)
    expect(frameAt(NaN, pack)).toBe(0)
  })
})

describe('pack files and sets', () => {
  it('a pack belongs to its set, also under a prefixed id; not to another', () => {
    expect(matchesSet('warehouse', 'warehouse')).toBe(true)
    expect(matchesSet('warehouse', 'locations/warehouse')).toBe(true)
    expect(matchesSet('warehouse', 'warehouse-2')).toBe(false)
    expect(matchesSet('warehouse', 'synthetic')).toBe(false)
  })

  it('reads the pack index in any of its shapes, dropping ids that are not folder names', () => {
    expect(parseIndex(['a', 'b-2'])).toEqual(['a', 'b-2'])
    expect(parseIndex([{ id: 'a' }, { nope: 1 }])).toEqual(['a'])
    expect(parseIndex({ performances: ['warehouse-fight', '../etc'] })).toEqual(['warehouse-fight'])
    expect(parseIndex(null)).toEqual([])
  })
})

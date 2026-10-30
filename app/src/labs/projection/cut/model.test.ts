import { describe, expect, it } from 'vitest'
import {
  bestPerWarp, commonRange, cutFrames, evenSegments, locate, moveCut, outputSize, removeSegment, splitAt, takeFrame, validateCut,
  type CutSegment, type CutTake,
} from './model'

const take = (o: Partial<CutTake> & { id: string }): CutTake => ({
  warpFolder: 'warp-a', kind: 'draft', file: `${o.id}.mp4`, url: '/x', width: 960, height: 544, frames: 97, sourceStart: 0, hasAudio: true, stamp: '1', ...o,
})

describe('cut model', () => {
  it('maps the performance clock to the take frame through sourceStart', () => {
    const t = take({ id: 'a', sourceStart: 24, frames: 48 })
    expect(takeFrame(t, 30)).toBe(6)
    const segs: CutSegment[] = [{ takeId: 'a', in: 24, out: 72 }]
    expect(validateCut(segs, [t])).toEqual([])
    expect(validateCut([{ takeId: 'a', in: 20, out: 72 }], [t])[0]).toMatch(/outside the take \(24-72\)/)
    expect(validateCut([{ takeId: 'a', in: 24, out: 73 }], [t])[0]).toMatch(/outside the take/)
    expect(locate(segs, [t], 30)).toMatchObject({ index: 0, frame: 6 })
  })

  it('picks finished over final over draft per camera move, newest stamp on a tie', () => {
    const picks = bestPerWarp([
      take({ id: 'd', kind: 'draft', stamp: '9' }), take({ id: 'f', kind: 'final', stamp: '1' }), take({ id: 'x', kind: 'finished', stamp: '1' }),
      take({ id: 'y', kind: 'finished', stamp: '2' }),
      take({ id: 'o', warpFolder: 'warp-b', kind: 'draft' }), take({ id: 'p', warpFolder: 'warp-b', kind: 'final' }),
    ])
    expect(picks.map((t) => t.id)).toEqual(['y', 'p'])
  })

  it('starts as contiguous segments over the common range', () => {
    const ts = [take({ id: 'a', sourceStart: 0 }), take({ id: 'b', sourceStart: 10, frames: 60 })]
    expect(commonRange(ts)).toEqual([10, 70])
    const segs = evenSegments(ts, 10, 70)
    expect(segs).toEqual([{ takeId: 'a', in: 10, out: 40 }, { takeId: 'b', in: 40, out: 70 }])
    expect(validateCut(segs, ts)).toEqual([])
    expect(commonRange([take({ id: 'a', frames: 10 }), take({ id: 'b', sourceStart: 50 })])).toBeNull()
  })

  it('keeps segments contiguous through move, split and remove', () => {
    const ts = [take({ id: 'a' }), take({ id: 'b' }), take({ id: 'c' })]
    let segs = evenSegments(ts, 0, 90)
    segs = moveCut(segs, 0, 500)
    expect(segs[0].out).toBe(segs[1].out - 1) // clamped one frame inside the next segment
    segs = moveCut(segs, 1, 60)
    segs = splitAt(segs, 45)
    expect(segs.length).toBe(4)
    segs = removeSegment(segs, 1)
    expect(validateCut(segs, ts)).toEqual([])
    expect(segs[0].in).toBe(0)
    expect(segs[segs.length - 1].out).toBe(90)
    expect(cutFrames(segs)).toBe(90)
    expect(removeSegment(removeSegment(segs, 0), 0).length).toBe(1)
  })

  it('refuses gaps, overlaps and empty segments', () => {
    const ts = [take({ id: 'a' })]
    expect(validateCut([{ takeId: 'a', in: 0, out: 10 }, { takeId: 'a', in: 12, out: 20 }], ts).join()).toMatch(/starts at 12 but the one before ends at 10/)
    expect(validateCut([{ takeId: 'a', in: 0, out: 10 }, { takeId: 'a', in: 8, out: 20 }], ts).join()).toMatch(/starts at 8/)
    expect(validateCut([{ takeId: 'a', in: 5, out: 5 }], ts).join()).toMatch(/out after in/)
    expect(validateCut([], ts)).toHaveLength(1)
    expect(validateCut([{ takeId: 'gone', in: 0, out: 5 }], ts).join()).toMatch(/not on disk/)
  })

  it('scales a mixed cut to the largest size, even numbers', () => {
    const ts = [take({ id: 'a' }), take({ id: 'b', width: 1920, height: 1088 })]
    const segs = evenSegments(ts, 0, 90)
    expect(outputSize(segs, ts)).toEqual({ width: 1920, height: 1088, mixed: true })
    expect(outputSize(segs.slice(0, 1), ts).mixed).toBe(false)
  })
})

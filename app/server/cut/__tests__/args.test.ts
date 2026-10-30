import { describe, expect, it } from 'vitest'
import type { CutTake } from '../../../src/labs/projection/cut/model.ts'
import { buildCutArgs } from '../args.ts'

const take = (o: Partial<CutTake>): CutTake => ({ id: 'a', warpFolder: 'warp-a', kind: 'draft', file: 'a.mp4', url: '', width: 960, height: 544, frames: 97, sourceStart: 0, hasAudio: true, stamp: '1', ...o })

describe('buildCutArgs', () => {
  it('trims by take frame, scales to the output size, concatenates with audio', () => {
    const args = buildCutArgs([
      { seg: { takeId: 'a', in: 30, out: 54 }, take: take({ sourceStart: 24 }), file: 'A.mp4' },
      { seg: { takeId: 'b', in: 54, out: 78 }, take: take({ id: 'b', width: 1920, height: 1088 }), file: 'B.mp4' },
    ], { width: 1920, height: 1088 }, 'out.part.mp4')
    const fc = args[args.indexOf('-filter_complex') + 1]
    expect(args.slice(0, 4)).toEqual(['-hide_banner', '-loglevel', 'error', '-n']) // never overwrite
    expect(args.filter((a) => a === '-i')).toHaveLength(2)
    expect(fc).toContain('[0:v]trim=start_frame=6:end_frame=30')
    expect(fc).toContain('[1:v]trim=start_frame=54:end_frame=78')
    expect(fc).toContain('scale=1920:1088:force_original_aspect_ratio=decrease,pad=1920:1088')
    expect(fc).toContain('[0:a]atrim=start=0.25:end=1.25')
    expect(fc).toContain('concat=n=2:v=1:a=1[v][a]')
    expect(args).toContain('aac')
    expect(args[args.length - 1]).toBe('out.part.mp4')
  })

  it('fills a render with no audio stream with silence of the segment length; none at all drops the track', () => {
    const mixed = buildCutArgs([
      { seg: { takeId: 'a', in: 0, out: 24 }, take: take({}), file: 'A.mp4' },
      { seg: { takeId: 'b', in: 24, out: 48 }, take: take({ id: 'b', hasAudio: false }), file: 'B.mp4' },
    ], { width: 960, height: 544 }, 'o.mp4')
    expect(mixed[mixed.indexOf('-filter_complex') + 1]).toContain('anullsrc=r=48000:cl=stereo,atrim=end=1')
    const none = buildCutArgs([{ seg: { takeId: 'b', in: 0, out: 24 }, take: take({ hasAudio: false }), file: 'B.mp4' }], { width: 960, height: 544 }, 'o.mp4')
    expect(none[none.indexOf('-filter_complex') + 1]).toContain('concat=n=1:v=1:a=0[v]')
    expect(none).not.toContain('aac')
  })
})

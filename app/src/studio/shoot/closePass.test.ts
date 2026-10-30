// Join: S1's close-pass suggestion on Shoot's keyframe picker. The locked take's clay cameras and the performer's ground tracks
// (performance seconds) in; a grid mid frame and a "passes close" line out, named from the Bible; the Bible names for the focus label.
import { describe, expect, it } from 'vitest'
import { fakeTake } from '../../labs/projection/clay/__fixtures__/take'
import { lockKey, lockRequest } from '../../labs/projection/clay/plan'
import type { BibleRecord } from '../../shared/bibleContract'
import { isMidFrame, type TakeRecord } from '../../shared/shotContract'
import type { GroundTrack } from '../../stage3d/performer'
import { entityName, heroTag } from './castNames'
import { closePassHint } from './closePassHint'

const pack = (frames: number) => ({ id: 'pack-a', fps: 24, frames })
const q = lockRequest(fakeTake(4, { timelineStart: 0.5 }), pack(400), 'loc-a', 16 / 9)
const rec = { ...q, id: 'take-a', startKey: lockKey(q).startKey, lockedAt: '', createdAt: '' } as TakeRecord
/** runs toward the camera rig's line (x = 2, the camera dollies x 0 -> 4 looking down -z) from 40 m out, from `delay` s of performance */
const runner = (delay: number, speed = 14): GroundTrack => ({ id: 'hero', height: 1.8, at: (t) => [2, Math.min(-2.5, -40 + Math.max(0, t - delay) * speed)] })
const far: GroundTrack = { id: 'extra:0:1', height: 1.8, at: () => [2, -60] }
const bible = { elements: [{ tag: 'runner', kind: 'cast', cardId: 'card-r', refs: [], line: '' }, { tag: 'dragon', kind: 'creature', refs: [], line: '' }] } as unknown as BibleRecord

describe('the close-pass hint on the keyframe picker', () => {
  it('a figure who closes on the camera mid-take: a mid frame on the 8-grid, named from the Bible, offered as a question', () => {
    const h = closePassHint(rec, pack(400), [runner(1.5), far], (t) => entityName(bible, 'card-r', t))!
    expect(h).not.toBeNull()
    expect(isMidFrame(h.frame, rec.frames)).toBe(true)
    expect(h.text).toBe(`Runner passes close at f${h.frame}: a mid keyframe helps only if its set matches the opening.`)
  })
  it('performance time, not take time: the same runner starting later peaks later in the take', () => {
    const a = closePassHint(rec, pack(400), [runner(1.2)])!, b = closePassHint(rec, pack(400), [runner(1.9)])!
    expect(b.frame).toBeGreaterThan(a.frame)
    expect(a.label).toBe('hero')
  })
  it('nothing to say: nobody close, no tracks, or a take the performance on the set cannot replay', () => {
    expect(closePassHint(rec, pack(400), [far])).toBeNull()
    expect(closePassHint(rec, pack(400), [])).toBeNull()
    expect(closePassHint(rec, pack(60), [runner(1.5)])).toBeNull()
  })
})

describe('Bible names for stage figures', () => {
  it('the hero is the cast element on the performance card, else the only cast element; creatures by kind; extras fall back', () => {
    expect(heroTag(bible, 'card-r')).toBe('runner')
    expect(heroTag(bible, null)).toBe('runner')
    const two = { elements: [...bible.elements, { tag: 'aldric', kind: 'cast', cardId: 'card-a', refs: [], line: '' }] } as unknown as BibleRecord
    expect(heroTag(two, 'card-a')).toBe('aldric')
    expect(heroTag(two, null)).toBeNull()
    // plain names, never the @ syntax (no brief here: a cast tag as a proper name, anything else as words)
    expect(entityName(two, 'card-a', 'hero')).toBe('Aldric')
    expect(entityName(bible, null, 'creature:dragon')).toBe('The dragon')
    expect(entityName(bible, null, 'extra:1:2')).toBeUndefined()
    expect(entityName(null, null, 'hero')).toBeUndefined()
  })
})

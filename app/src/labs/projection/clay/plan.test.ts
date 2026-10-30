import { describe, expect, it } from 'vitest'
import { startKey, type TakeRecord } from '../../../shared/shotContract'
import { changedSinceLock, currentLock } from '../../../studio/shoot/takeLock'
import { fakeTake } from './__fixtures__/take'
import { CLAY_MAX, clayCameras, clayPlan, lockKey, lockRequest, recordPlan, takeFrames } from './plan'

const pack = (frames: number) => ({ id: 'pack-a', fps: 24, frames })

describe('clay length: 8k+1 at 24 fps inside the take and the performance, capped at 161', () => {
  it('fits the take, the pack and the cap', () => {
    expect(takeFrames(fakeTake(4).smoothed)).toBe(97)
    expect(lockRequest(fakeTake(4), pack(400), 'loc-a', 1.5).frames).toBe(97)
    expect(lockRequest(fakeTake(3.9), pack(400), 'loc-a', 1.5).frames).toBe(89)
    expect(lockRequest(fakeTake(10), pack(400), 'loc-a', 1.5).frames).toBe(CLAY_MAX)
    expect(lockRequest(fakeTake(10), pack(100), 'loc-a', 1.5).frames).toBe(97) // the performance runs out first
    expect(lockRequest(fakeTake(10), null, 'loc-a', 1.5).frames).toBe(CLAY_MAX) // no performance: the take alone
    expect(() => lockRequest(fakeTake(0.3), pack(400), 'loc-a', 1.5)).toThrow(/shorter than 9 frames/)
  })

  it('locks the smoothed track, the frame-0 focal, the view aspect and the performance frame at the take start', () => {
    const t = fakeTake(4, { timelineStart: 0.5, focal: 50 })
    const q = lockRequest(t, pack(400), 'loc-a', 1.5)
    expect(q).toMatchObject({ worldId: 'loc-a', packId: 'pack-a', fps: 24, focal: 50, viewAspect: 16 / 9, perfStart: 12, timelineStart: 0.5 })
    expect(q.samples).toBe(t.smoothed)
    expect(lockRequest({ ...t, viewAspect: undefined }, null, 'loc-a', 1.5)).toMatchObject({ viewAspect: 1.5, packId: null })
  })
})

describe('the lock key and "changed since lock"', () => {
  it('is the contract startKey of the lock request (the server stamps the same)', () => {
    const q = lockRequest(fakeTake(4), pack(400), 'loc-a', 1.5)
    expect(lockKey(q)).toEqual({ startKey: startKey(q.samples[0], q.focal, q.perfStart), frames: 97 })
  })

  it('changes with the opening or the length, not with the move after frame 0', () => {
    const lock = currentLock(fakeTake(4), pack(400), 'loc-a', 1.5)
    if (!lock || !('key' in lock)) throw new Error('no lock')
    const locked = { startKey: lock.key.startKey, frames: lock.key.frames, worldId: 'loc-a' }
    const keyOf = (t: ReturnType<typeof fakeTake>, p = pack(400)) => { const c = currentLock(t, p, 'loc-a', 1.5); return c && 'key' in c ? c.key : null }
    expect(changedSinceLock(locked, keyOf(fakeTake(4)), 'loc-a')).toBe(false)
    expect(changedSinceLock(locked, keyOf(fakeTake(4, { x0: 0.5 })), 'loc-a')).toBe(true) // a new opening pose
    expect(changedSinceLock(locked, keyOf(fakeTake(4, { focal: 50 })), 'loc-a')).toBe(true) // a new lens
    expect(changedSinceLock(locked, keyOf(fakeTake(4, { timelineStart: 1 })), 'loc-a')).toBe(true) // a later performance frame
    expect(changedSinceLock(locked, keyOf(fakeTake(6)), 'loc-a')).toBe(true) // a longer take
    expect(changedSinceLock(locked, keyOf(fakeTake(4)), 'loc-b')).toBe(true) // another world on the set (B3)
    expect(changedSinceLock(null, keyOf(fakeTake(4)), 'loc-a')).toBe(false)
    expect(currentLock(null, null, 'loc-a', 1.5)).toBeNull()
    expect(currentLock(fakeTake(0.2), null, 'loc-a', 1.5)).toEqual({ error: expect.stringMatching(/shorter/) })
  })
})

describe('the clay plan of a locked record', () => {
  const t = fakeTake(4, { timelineStart: 0.5 })
  const q = lockRequest(t, pack(400), 'loc-a', 1.5)
  const rec = { ...q, id: 'take-a', startKey: lockKey(q).startKey, lockedAt: '', createdAt: '' } as TakeRecord

  it('replans the same frames and cameras the lock saw', () => {
    const live = clayPlan({ smoothed: t.smoothed, timelineStart: 0.5, viewAspect: 16 / 9 }, pack(400))
    const p = recordPlan(rec, pack(400))
    expect(p.frames).toHaveLength(97)
    expect(p.sourceStart).toBe(12)
    expect(clayCameras(p)).toEqual(clayCameras(live))
    expect(p.frames[0].vfovDeg).toBeGreaterThan(0)
  })

  it('refuses a performance that can no longer give the locked length', () => {
    expect(() => recordPlan(rec, pack(60))).toThrow(/gives 41 frames; the take was locked with 97/)
  })
})

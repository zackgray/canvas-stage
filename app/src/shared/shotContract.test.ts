import { describe, expect, it } from 'vitest'
import {
  COLORMATCH, isStale, KEYFRAME_ROLES, ROUTES, shotPaths, startKey, type ClayExport, type HeroStill, type KeyframeStill, type L2RRender, type TakeRecord,
} from './shotContract'

const s0 = { position: [1, 1.6, -2] as [number, number, number], quaternion: [0, 0.38268, 0, 0.92388] as [number, number, number, number] }

describe('startKey', () => {
  it('is stable, 8 hex chars, and ignores noise below 1e-4', () => {
    const k = startKey(s0, 35, 0)
    expect(k).toMatch(/^[0-9a-f]{8}$/)
    expect(startKey({ ...s0 }, 35, 0)).toBe(k)
    expect(startKey({ ...s0, position: [1 + 1e-7, 1.6, -2] }, 35, 0)).toBe(k)
  })
  it('changes with the frame-0 pose, the focal or the performance frame', () => {
    const k = startKey(s0, 35, 0)
    expect(startKey({ ...s0, position: [1.01, 1.6, -2] }, 35, 0)).not.toBe(k)
    expect(startKey({ ...s0, quaternion: [0, 0.4, 0, 0.9165] }, 35, 0)).not.toBe(k)
    expect(startKey(s0, 50, 0)).not.toBe(k)
    expect(startKey(s0, 35, 12)).not.toBe(k)
  })
})

describe('isStale', () => {
  const take = { id: 'take-a', startKey: startKey(s0, 35, 0) } as TakeRecord
  const still = { takeId: 'take-a', startKey: take.startKey } as HeroStill
  it('is fresh for its own take with the same start, stale otherwise', () => {
    expect(isStale(still, take)).toBe(false)
    expect(isStale(still, { ...take, startKey: startKey(s0, 50, 0) })).toBe(true)
    expect(isStale(still, { ...take, id: 'take-b' })).toBe(true)
  })
})

describe('routes and layout', () => {
  it('names the four routes and the per-take folders', () => {
    expect(Object.values(ROUTES)).toEqual(['/__lab/takes', '/__lab/clay', '/__lab/hero', '/__lab/l2r'])
    expect(shotPaths('take-a')).toEqual({ root: 'lab-assets/shots/take-a', take: 'lab-assets/shots/take-a/take.json',
      clay: 'lab-assets/shots/take-a/clay', hero: 'lab-assets/shots/take-a/hero', l2r: 'lab-assets/shots/take-a/l2r' })
  })
})

describe('Wave 0.5 fields (add-only)', () => {
  it('records written before them still satisfy the shapes, and the new shapes come from this file', () => {
    // as Wave B wrote them: none of bibleVersion, action, role, frame, idPass, keyframes, grade
    const take = { id: 'take-a', worldId: 'loc-a', packId: null, fps: 24, frames: 97, samples: [], focal: 35, viewAspect: 16 / 9, perfStart: 0,
      startKey: 'abcd1234', lockedAt: '2026-10-22T10:00:00.000Z', createdAt: '2026-10-22T10:00:00.000Z' } satisfies TakeRecord
    const still = { id: 's', takeId: 'take-a', startKey: 'abcd1234', png: '/p.png', seed: 1, jobId: null, credits: 1, approved: true, createdAt: '' } satisfies HeroStill
    const clay = { takeId: 'take-a', startKey: 'abcd1234', mp4: null, frames: 97, width: 1920, height: 1088, status: 'done' } satisfies ClayExport
    const render = { id: 'r', takeId: 'take-a', stillId: 's', clay: '/c.mp4', raw: null, finished: null, jobId: null, credits: 0, status: 'done' } satisfies L2RRender
    expect(isStale(still, take)).toBe(false)
    expect(clay.status).toBe(render.status)
    const mid: KeyframeStill = { ...still, role: 'mid', frame: 48, bibleVersion: 2 }
    expect(isStale(mid, take)).toBe(false)
    expect(KEYFRAME_ROLES).toEqual(['opening', 'mid', 'end'])
    expect(COLORMATCH).toEqual({ script: 'scripts/l2r/colormatch.py', method: 'reinhard-lab' })
  })
})

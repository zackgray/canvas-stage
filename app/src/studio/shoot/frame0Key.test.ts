// Recipe wave 3, track CARRY: the frame-0 key says whether frame 0 still shows the same people, set and camera. A blocking fix after
// the start (an extra's mid-path point) keeps it; moving where anyone stands at frame 0, their look, the set or the camera changes it.
import { beforeAll, describe, expect, it } from 'vitest'
import type { CameraSample } from '../../labs/controller/take/types'
import type { PerformancePlan } from '../../stage3d/contract'
import type { Library } from '../../stage3d/motion/library'
import { performerFrom } from '../../stage3d/performer'
import { STRAIGHT, diskLibrary } from '../../stage3d/__tests__/motion.fixture'
import { appearanceOf, frame0Key } from './frame0Key'

let lib: Library
beforeAll(async () => { lib = await diskLibrary() }, 60_000)

const cam = (t: number, x = 0): CameraSample => ({ t, position: [x, 1.4, 6], quaternion: [0, 0, 0, 1], focal: 50, focus: 5 })
const req = (x = 0) => ({ samples: Array.from({ length: 30 }, (_, i) => cam(i / 24, x)), timelineStart: 0.5, viewAspect: 16 / 9, focal: 50, frames: 9, perfStart: 12 })
const pack = { fps: 24, frames: 400 }
const SET = { items: [{ kind: 'wall', at: [2, -3] }] }

const extra = (path: [number, number][]) => ({ path, gait: 'walk' as const, delay: 0, costume: 'modern' as const, variant: 1 })
const PLAN: PerformancePlan = { ...STRAIGHT, extras: [extra([[-4, -6], [-4, -12], [-2, -20]])] }

function keyOf(plan: PerformancePlan, over: { set?: unknown; x?: number } = {}) {
  const p = performerFrom(plan, () => 0, lib)
  return frame0Key(req(over.x), pack, p, { plan: over.set ?? SET, look: appearanceOf(plan) })
}

describe('frame0Key', () => {
  it('is the same for the same frame 0, from two separately built performers', () => {
    expect(keyOf(PLAN)).toMatch(/^[0-9a-f]{8}$/)
    expect(keyOf(PLAN)).toBe(keyOf(PLAN))
  })

  it('an extra\'s later path point moved: frame 0 is the same, so the key is', () => {
    const moved: PerformancePlan = { ...PLAN, extras: [extra([[-4, -6], [-4, -12], [3, -25]])] }
    expect(keyOf(moved)).toBe(keyOf(PLAN))
  })

  it('a moved extra blocks the carry: their start moved, so frame 0 changed', () => {
    const moved: PerformancePlan = { ...PLAN, extras: [extra([[-3, -6], [-4, -12], [-2, -20]])] }
    expect(keyOf(moved)).not.toBe(keyOf(PLAN))
  })

  it('the hero\'s start moved, a costume or the cast changed, the set or the camera changed: all change the key', () => {
    const base = keyOf(PLAN)
    expect(keyOf({ ...PLAN, path: [[0.5, 0], [0, -10]] })).not.toBe(base)
    expect(keyOf({ ...PLAN, costume: 'soldier' })).not.toBe(base)
    expect(keyOf({ ...PLAN, castId: 'cast-2' } as PerformancePlan)).not.toBe(base)
    expect(keyOf(PLAN, { set: { items: [{ kind: 'wall', at: [2.5, -3] }] } })).not.toBe(base)
    expect(keyOf(PLAN, { x: 0.2 })).not.toBe(base)
  })

  it('cannot say without a kit set plan (a panorama or pack world): null, so nothing is ever carried', () => {
    expect(frame0Key(req(), pack, performerFrom(PLAN, () => 0, lib), null)).toBeNull()
    expect(frame0Key({ ...req(), timelineStart: undefined }, pack, null, { plan: SET, look: null })).toBeNull()
  })
})

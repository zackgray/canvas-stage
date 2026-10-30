// Wave A (W0): every hero motion goes through heroTimeline (standPlan, then compile, then padToShot). A performance with no stand
// and no shotSeconds must compile, hash and lock exactly as on main: the golden values below were captured on main (96d1f48)
// before the seam landed. The new fields join the pack hash only when set.
import { describe, expect, it } from 'vitest'
import { mocapPack, planHash } from '../../labs/projection/stage3d/MocapLayer'
import { motionAt } from '../../../server/hero/stillAction'
import type { PerformancePlan } from '../contract'
import { compile } from '../motion/compile'
import { heroTimeline } from '../motion/heroPlan'
import { padToShot } from '../motion/shotPad'
import { STAND_STUB_M, standPath, standPlan } from '../motion/standPlan'
import { performerFrom } from '../performer'
import { WALK_TOWARD } from '../presets'
import * as F from './motion.fixture'

const EXTRAS: PerformancePlan = { ...WALK_TOWARD, costume: 'soldier', turnRadius: 0.9,
  extras: [{ path: [[1, -10], [1, -5]], gait: 'walk', delay: 0.5, costume: 'modern', variant: 2, tag: 'crowd' }] }
const PLANS: Record<string, PerformancePlan> = { WALK_TOWARD, EXTRAS, STRAIGHT: F.STRAIGHT, L_PATH: F.L_PATH, KNEEL_UP: F.KNEEL_UP,
  KNEEL_END: F.KNEEL_END, BEND: F.BEND, ABOUT: F.ABOUT, LIFT_END: F.LIFT_END, LIFT_ON: F.LIFT_ON, LIFT_HERE: F.LIFT_HERE }

/** captured on main 96d1f48 with compile(plan, lib) and planHash(plan); durations and frames re-taken 2026-10-28 when every clip's
 *  capture jitter was low-passed at load (motion/smooth.ts: strides shift by under a millimetre; LIFT_ON's stop entry moved one frame),
 *  and 2026-10-29 for every plan with a stop or a start when those clips became CMU 16_34 and 16_32 (the new stop is 0.15-0.79 s
 *  longer: a slow walk braking over two steps; the pack ids are unchanged, the plans are) */
const GOLDEN: Record<string, { hash: string; duration: number; frames: number; kinds: string }> = {
  WALK_TOWARD: { hash: '7b5afd52', duration: 4.4370158384984935, frames: 107, kinds: 'travel' },
  EXTRAS: { hash: 'a4f08d3d', duration: 4.4370158384984935, frames: 107, kinds: 'travel' },
  STRAIGHT: { hash: '1891618b', duration: 9.860035196663318, frames: 237, kinds: 'travel' },
  L_PATH: { hash: 'b06e5bba', duration: 17.32911585781027, frames: 416, kinds: 'travel,stop,stop,look,turn,start,travel' },
  KNEEL_UP: { hash: '3c2ea8d3', duration: 16.47911585781027, frames: 396, kinds: 'travel,stop,kneel,kneel-hold,kneel-up,start,travel' },
  KNEEL_END: { hash: '500aa305', duration: 11.246010770121911, frames: 270, kinds: 'travel,stop,kneel,kneel-hold' },
  BEND: { hash: '4a3ba7f0', duration: 15.604007104388549, frames: 375, kinds: 'travel' },
  ABOUT: { hash: '8dfa9614', duration: 15.565129237501935, frames: 374, kinds: 'travel,stop,turn,turn,start,travel' },
  LIFT_END: { hash: '6d8133f3', duration: 10.83474306420927, frames: 261, kinds: 'travel,stop,lift,lift-hold' },
  LIFT_ON: { hash: '3648aed1', duration: 18.823783286580706, frames: 452, kinds: 'travel,stop,lift,lift-hold,lift-down,start,travel' },
  LIFT_HERE: { hash: '4e5b2c5f', duration: 6.5, frames: 156, kinds: 'lift,lift-hold' },
}

/** the server still's words at t = 0, 3, 6, 9, 12, 99 s, captured on main; L_PATH's 12 s is mid-turn since the longer stop (2026-10-29) */
// (stage-only) the lift clip's phase words name no test piece any more (clips.ts); the timing is unchanged
const W = 'walking', HOLD = 'holding something up at head height in both hands, looking at it'
const STILL_GOLDEN: Record<string, { words: string[]; pose: boolean }> = {
  L_PATH: { words: [W, W, W, 'standing, looking round', 'turning on the spot', W], pose: false },
  LIFT_END: { words: [W, W, 'bending over the piece in front of them, reaching into it with both hands, the hands still empty', HOLD, HOLD, HOLD], pose: true },
  KNEEL_UP: { words: [W, W, W, 'kneeling', W, W], pose: true },
}

const shape = (tl: ReturnType<typeof compile>) => tl.segs.map((g) => ({ kind: g.kind, t0: g.t0, t1: g.t1 }))

describe('heroTimeline: old performances compile exactly as on main', () => {
  it('same duration, segment list, frame count and pack id as main for every existing fixture', async () => {
    const lib = await F.diskLibrary()
    for (const [name, plan] of Object.entries(PLANS)) {
      const tl = heroTimeline(plan, lib), g = GOLDEN[name]
      expect({ name, hash: planHash(plan), duration: tl.duration, frames: mocapPack(plan, 'w', tl.duration).frames, kinds: tl.segs.map((s) => s.kind).join(',') })
        .toEqual({ name, ...g })
      expect(shape(tl)).toEqual(shape(compile(plan, lib)))
    }
  })

  it('the browser performer plays the same timeline (its duration and pack frames are main\'s)', async () => {
    const lib = await F.diskLibrary()
    for (const name of ['WALK_TOWARD', 'L_PATH', 'LIFT_END'] as const) {
      const p = performerFrom(PLANS[name], () => 0, lib)
      expect(p.duration).toBe(GOLDEN[name].duration)
      expect(shape(p.timeline)).toEqual(shape(compile(PLANS[name], lib)))
    }
  })

  it('the server still reads the same words at every frame as on main', async () => {
    const lib = await F.diskLibrary()
    for (const [name, g] of Object.entries(STILL_GOLDEN)) {
      const got = [0, 3, 6, 9, 12, 99].map((t) => motionAt(PLANS[name], t, null, lib))
      expect(got.map((m) => m.words)).toEqual(g.words)
      expect(got.every((m) => m.pose === g.pose)).toBe(true)
    }
  })

  it('the empty slots hand back the very same objects when the new fields are absent', async () => {
    const lib = await F.diskLibrary()
    expect(standPlan(F.L_PATH)).toBe(F.L_PATH)
    const tl = compile(F.L_PATH, lib)
    expect(padToShot(tl, F.L_PATH, lib)).toBe(tl)
  })
})

describe('the pack hash takes stand and shotSeconds only when set', () => {
  it('absent: main\'s id; set: a new id; stand false hashes as absent', () => {
    expect(planHash(WALK_TOWARD)).toBe('7b5afd52')
    expect(planHash({ ...WALK_TOWARD, stand: undefined, shotSeconds: undefined })).toBe('7b5afd52')
    expect(planHash({ ...WALK_TOWARD, stand: false })).toBe('7b5afd52')
    const stand = planHash({ ...WALK_TOWARD, stand: true }), shot = planHash({ ...WALK_TOWARD, shotSeconds: 8 })
    expect(stand).not.toBe('7b5afd52')
    expect(shot).not.toBe('7b5afd52')
    expect(planHash({ ...WALK_TOWARD, shotSeconds: 6 })).not.toBe(shot)
    expect(planHash({ ...EXTRAS, shotSeconds: 8 })).not.toBe(GOLDEN.EXTRAS.hash)
  })
})

describe('standPath', () => {
  it('is the mark, then a 0.2 m stub along its yaw (0 = +z)', () => {
    expect(standPath({ at: [1, 2] })).toEqual([[1, 2], [1, 2 + STAND_STUB_M]])
    const [a, b] = standPath({ at: [1, 2], yawDeg: 90 })
    expect(a).toEqual([1, 2])
    expect(b[0]).toBeCloseTo(1.2, 12)
    expect(b[1]).toBeCloseTo(2, 12)
    const [, c] = standPath({ at: [0, 0], yawDeg: 180 })
    expect(c[0]).toBeCloseTo(0, 12)
    expect(c[1]).toBeCloseTo(-0.2, 12)
  })
})

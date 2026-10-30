// Wave A (S7): the shot's one length. With shotSeconds saved, the hero's motion is padded to shot + 1/24 s (an 8 s shot: 8.042 to
// 8.063 s, a pack of 193 or 194 frames, a lock of 193) by holding the last kneel or lift longer, or by stopping and idling at the
// path's end. With no shotSeconds nothing changes (main's golden values, motion.heroPlan.test.ts).
import { beforeAll, describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { lockRequest } from '../../labs/projection/clay/plan'
import { STAGE_RIGS } from '../../labs/projection/operator/link'
import { StageOperatorEngine } from '../../labs/projection/operator/stageEngine'
import { fit8n1 } from '../../labs/projection/performance/warpPlan'
import { mocapPack, planHash } from '../../labs/projection/stage3d/MocapLayer'
import { CLAY_MAX } from '../../labs/projection/clay/plan'
import type { PerformancePlan } from '../contract'
import { compile } from '../motion/compile'
import { heroTimeline } from '../motion/heroPlan'
import type { Library } from '../motion/library'
import { padToShot } from '../motion/shotPad'
import { performerFrom } from '../performer'
import { WALK_TOWARD } from '../presets'
import * as F from './motion.fixture'

let lib: Library
beforeAll(async () => { lib = await F.diskLibrary() }, 60_000)

const kinds = (tl: { segs: { kind: string }[] }) => tl.segs.map((s) => s.kind)
/** what the lock keeps from frame 0 of an 8 s preset take (193 frames) over this pack: the take and the pack, 8k+1, capped */
const lockFrames = (packFrames: number) => fit8n1(Math.min(193, packFrames), CLAY_MAX)
/** the stand-and-lift as track S3's standPlan plays it: the 0.2 m stub on the mark, the lift at the start, no closing idle */
const STAND_LIFT: PerformancePlan = { path: [[0.6, -12.5], [0.6, -12.3]], stand: true, actions: [{ kind: 'lift', at: 0, seconds: 2 }] }

describe('padToShot: an 8 s shot', () => {
  it('the default walk stops and idles to 8.042-8.063 s; its pack covers 193 frames and an 8 s take locks 193', () => {
    const plan = { ...WALK_TOWARD, shotSeconds: 8 }
    const tl = heroTimeline(plan, lib)
    expect(compile(WALK_TOWARD, lib).duration).toBeLessThan(5)
    expect(tl.duration).toBeGreaterThanOrEqual(8 + 1 / 24 - 1e-9)
    expect(tl.duration).toBeLessThanOrEqual(8.063)
    const pack = mocapPack(plan, 'w', tl.duration)
    expect(pack.frames).toBeGreaterThanOrEqual(193)
    expect(lockFrames(pack.frames)).toBe(193)
    // after the walk the figure is on the idle clip, not frozen on the walk's last pose
    expect(kinds(tl).at(-1)).toBe('idle')
    expect(kinds(tl)).toContain('travel')
  })

  it('the browser performer plays the padded timeline (the world clock and the lock read its duration)', () => {
    const plan = { ...WALK_TOWARD, shotSeconds: 8 }
    const p = performerFrom(plan, () => 0, lib)
    expect(p.duration).toBeGreaterThanOrEqual(8 + 1 / 24 - 1e-9)
    expect(p.duration).toBeLessThanOrEqual(8.063)
  })

  it('a walk ending on a kneel holds the kneel longer instead (no standing up)', () => {
    const short: PerformancePlan = { path: [[0, 0], [0, -2]], actions: [{ kind: 'kneel', at: 2, seconds: 0.5 }] }
    expect(compile(short, lib).duration).toBeLessThan(7)
    const tl = heroTimeline({ ...short, shotSeconds: 8 }, lib)
    expect(kinds(tl).at(-1)).toBe('kneel-hold')
    expect(kinds(tl)).not.toContain('kneel-up')
    expect(tl.duration).toBeGreaterThanOrEqual(8 + 1 / 24 - 1e-9)
    expect(tl.duration).toBeLessThanOrEqual(8.063)
  })

  it('a 4 s and a 6 s shot pad to their own length', () => {
    for (const s of [4, 6]) {
      const tl = heroTimeline({ ...F.LIFT_HERE, actions: [{ kind: 'lift', at: 0, seconds: 0.3 }], shotSeconds: s }, lib)
      expect(tl.duration).toBeGreaterThanOrEqual(s + 1 / 24 - 1e-9)
      expect(tl.duration).toBeLessThanOrEqual(s + 1 / 24 + 1 / 48 + 1e-9)
    }
  })
})

describe('the lift demo: stand beside the hive, lift, 8 s', () => {
  it('ends on the hold (no lowering), lasts at least 8.0417 s and locks 193 frames', () => {
    const plan = { ...STAND_LIFT, shotSeconds: 8 }
    const tl = padToShot(compile(STAND_LIFT, lib), plan, lib)
    expect(kinds(compile(STAND_LIFT, lib))).toEqual(['lift', 'lift-hold'])
    expect(kinds(tl)).toEqual(['lift', 'lift-hold'])
    expect(tl.duration).toBeGreaterThanOrEqual(8 + 1 / 24 - 1e-9)
    expect(tl.duration).toBeLessThanOrEqual(8.063)
    expect(lockFrames(mocapPack(plan, 'w', tl.duration).frames)).toBe(193)
    // the hold plays past the clip's 3.45 s window, slowed: about 4.5 s of hold after the 3.5 s bend and raise
    const hold = tl.segs[1]
    expect(hold.t1 - hold.t0).toBeGreaterThan(3.45)
    expect(hold.t1 - hold.t0).toBeLessThan(4.6)
  })

  it('a walk-in before the lift runs past 8 s: left as it is (the shot line asks to shorten it)', () => {
    const plan = { ...F.LIFT_END, shotSeconds: 8 }
    const raw = compile(F.LIFT_END, lib)
    expect(raw.duration).toBeGreaterThan(8.1)
    expect(padToShot(raw, plan, lib)).toBe(raw)
  })
})

describe('no saved shot length: exactly main', () => {
  it('the very same timeline object, duration, pack id and pack frames for every fixture', () => {
    const golden: Record<string, [PerformancePlan, string, number]> = {
      WALK_TOWARD: [WALK_TOWARD, '7b5afd52', 107], KNEEL_END: [F.KNEEL_END, '500aa305', 270],
      LIFT_END: [F.LIFT_END, '6d8133f3', 261], LIFT_HERE: [F.LIFT_HERE, '4e5b2c5f', 156],
    }
    for (const [name, [plan, hash, frames]] of Object.entries(golden)) {
      const tl = compile(plan, lib)
      expect(padToShot(tl, plan, lib)).toBe(tl)
      const hero = heroTimeline(plan, lib)
      expect({ name, hash: planHash(plan), frames: mocapPack(plan, 'w', hero.duration).frames, d: hero.duration }).toEqual({ name, hash, frames, d: tl.duration })
    }
  })
})

describe('an 8 s preset take over the padded walk', () => {
  it('locks 193 frames (an unpadded 8.0 s walk would lock 185)', () => {
        const plan = { ...WALK_TOWARD, shotSeconds: 8 }
    const pack = { ...mocapPack(plan, 'loc-k', heroTimeline(plan, lib).duration) }
    const e = new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false, orbitTarget: () => new Vector3(0, 1.6, 0) })
    e.takeOver(new Vector3(0, 1.6, 6), new Quaternion(), 35)
    expect(e.startPreset('push', 8, true)).toBe(true)
    for (let i = 0; i < 2000 && e.move; i++) e.tick(1 / 60, 16 / 9)
    const take = e.deck.take!
    expect(take.raw.samples).toHaveLength(193)
    expect(lockRequest(take, pack, 'loc-k', 16 / 9).frames).toBe(193)
    expect(lockRequest(take, { ...pack, frames: 192 }, 'loc-k', 16 / 9).frames).toBe(185) // 8.0 s exactly: the pad is what buys 193
  })
})

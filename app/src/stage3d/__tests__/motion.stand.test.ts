// Wave A (S3): the hero standing at the mark. A stand saves the mark plus a 0.2 m stub along the mark's facing; standPlan turns that
// into a plan the compiler plays without walking: no start, travel or stop, the anchor on the mark, facing the mark's yaw.
import { beforeAll, describe, expect, it } from 'vitest'
import type { MarkPlan, PerformancePlan } from '../contract'
import { compile } from '../motion/compile'
import { heroTimeline } from '../motion/heroPlan'
import type { Library } from '../motion/library'
import { wrapAngle } from '../motion/path'
import { STAND_DEFAULT_S, standPath, standPlan } from '../motion/standPlan'
import { evaluator } from '../motion/timeline'
import * as F from './motion.fixture'

let lib: Library
beforeAll(async () => { lib = await F.diskLibrary() }, 60_000)

const MARK: MarkPlan = { at: [1.5, -9], yawDeg: 120 }
const stand = (extra: Partial<PerformancePlan> = {}): PerformancePlan => ({ path: standPath(MARK), pace: 0.8, stand: true, ...extra })
const MOVING = new Set(['start', 'travel', 'stop'])

describe('standPlan', () => {
  it('hands back the very same object when stand is unset or false', () => {
    expect(standPlan(F.L_PATH)).toBe(F.L_PATH)
    const off = { ...F.STRAIGHT, stand: false }
    expect(standPlan(off)).toBe(off)
  })

  it('no actions: a 4 s idle; shotSeconds and the other fields ride through', () => {
    const p = standPlan(stand({ shotSeconds: 6, costume: 'gown' }))
    expect(p.actions).toEqual([{ kind: 'idle', at: 0, seconds: STAND_DEFAULT_S }])
    expect([p.shotSeconds, p.costume, p.stand]).toEqual([6, 'gown', true])
    expect(p.path).toEqual(standPath(MARK))
  })

  it('actions are pinned to the start; a closing kneel or lift gets no trailing idle', () => {
    expect(standPlan(stand({ actions: [{ kind: 'lift', at: 3, seconds: 2 }] })).actions).toEqual([{ kind: 'lift', at: 0, seconds: 2 }])
    expect(standPlan(stand({ actions: [{ kind: 'kneel', at: 0, seconds: 2 }] })).actions).toEqual([{ kind: 'kneel', at: 0, seconds: 2 }])
    const look = standPlan(stand({ actions: [{ kind: 'look', at: 1, seconds: 2, deg: 30 }] })).actions!
    expect(look[0]).toEqual({ kind: 'look', at: 0, seconds: 2, deg: 30 })
    expect(look[1].kind).toBe('idle')
  })
})

describe('the compiled stand', () => {
  it('has no start, travel or stop; stays within 1 cm of the mark, facing its yaw within 2 degrees, for 4 s', () => {
    const tl = heroTimeline(stand(), lib), ev = evaluator(tl)
    expect(tl.segs.some((g) => MOVING.has(g.kind))).toBe(false)
    expect(tl.duration).toBeCloseTo(STAND_DEFAULT_S, 6)
    const yaw = (MARK.yawDeg! * Math.PI) / 180
    for (let t = 0; t <= tl.duration + 1e-9; t += tl.duration / 40) {
      const a = ev.anchor(t)
      expect(Math.hypot(a.x - MARK.at[0], a.z - MARK.at[1])).toBeLessThan(0.01)
      expect(Math.abs(wrapAngle(ev.heading(t) - yaw)) * (180 / Math.PI)).toBeLessThan(2)
    }
  })

  it('a stand with a lift ends on lift-hold, no lift-down', () => {
    const tl = heroTimeline(stand({ actions: [{ kind: 'lift', at: 0, seconds: 2 }] }), lib)
    const kinds = tl.segs.map((g) => g.kind)
    expect(kinds[kinds.length - 1]).toBe('lift-hold')
    expect(kinds).not.toContain('lift-down')
    expect(kinds.some((k) => MOVING.has(k))).toBe(false)
  })

  it('the bare stub without standPlan is walked (why the idle is needed)', () => {
    const tl = compile({ path: standPath(MARK) }, lib)
    expect(tl.segs.some((g) => MOVING.has(g.kind))).toBe(true)
  })
})

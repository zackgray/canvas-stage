// The Stage's Walk to a spot is a two-point path (the mark and the spot) at Slow walk / Walk / Run through the existing compiler
// and the shot's padding: these pin how far she gets in a take (the numbers the panel's reach line is built on).
import { beforeAll, describe, expect, it } from 'vitest'
import type { PerformancePlan } from '../contract'
import { compile } from '../motion/compile'
import { heroTimeline } from '../motion/heroPlan'
import type { Library } from '../motion/library'
import { SPEEDS } from '../../studio/stage/panels/WalkTo'
import * as F from './motion.fixture'

let lib: Library
beforeAll(async () => { lib = await F.diskLibrary() }, 60_000)
const walk = (m: number, s: (typeof SPEEDS)[number], shotSeconds?: number): PerformancePlan =>
  ({ path: [[0, 0], [0, -m]], pace: s.pace, gait: s.gait, ...(shotSeconds !== undefined ? { shotSeconds } : {}) })
const speed = (id: string) => SPEEDS.find((s) => s.id === id)!

describe('Walk to a spot through the motion compiler', () => {
  it('each speed covers about its stated metres a second (10 m, within 15 percent)', () => {
    for (const s of SPEEDS) {
      const t = compile(walk(10, s), lib).duration
      expect(10 / t).toBeGreaterThan(s.mps * 0.85)
      expect(10 / t).toBeLessThan(s.mps * 1.15)
    }
  })

  it('a walk that arrives with two seconds to spare is padded to the take length (she arrives and stands)', () => {
    for (const shot of [4, 6, 8]) {
      const tl = heroTimeline(walk(shot - 2, speed('walk'), shot), lib)
      expect(tl.duration).toBeGreaterThanOrEqual(shot + 1 / 24 - 1e-9)
      expect(tl.duration).toBeLessThanOrEqual(shot + 0.07)
    }
  })

  it('a walk longer than the take runs past it (the panel says the take keeps the first seconds)', () => {
    const tl = heroTimeline(walk(10, speed('walk'), 4), lib)
    expect(tl.duration).toBeGreaterThan(4 + 1)
  })

  it('a run covers an 8 m dash inside a 4 s take', () => {
    expect(compile(walk(8, speed('run')), lib).duration).toBeLessThan(4)
  })
})

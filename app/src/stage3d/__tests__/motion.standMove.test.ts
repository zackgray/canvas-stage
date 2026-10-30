// The Stage's default performance is a stand (server/stage3d/store.ts standingPerf): a stand with one made move (Describe a move)
// plays the move in and holds it, with no walk after: no start, travel or stop segment, and the shot length pads the hold to 6 s.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import type { MarkPlan, PerformancePlan } from '../contract.ts'
import { heroTimeline } from '../motion/heroPlan.ts'
import { loadLibrary, type Library } from '../motion/library.ts'
import { standPath } from '../motion/standPlan.ts'
import { refOf } from '../motion/userClips.ts'

const PUBLIC = fileURLToPath(new URL('../../../public', import.meta.url))
const LIFT_BVH = readFileSync(PUBLIC + '/mocap/kimodo/lift_frame.bvh', 'utf8')
const CLIP = JSON.stringify({
  url: '/lab-assets/motions/take-frame/clip.bvh', source: { generated: 'kimodo:test/1' }, note: 'takes a frame out of the hive',
  root: 'pinned', in: 1.0, out: 7.95, hold: [4.5, 7.95], prop: { kind: 'frame', grab: 2.5 },
})
const read = async (u: string): Promise<string> => {
  if (u === '/lab-assets/motions/take-frame/clip.json') return CLIP
  if (u.startsWith('/lab-assets/motions/')) return LIFT_BVH
  return readFileSync(PUBLIC + u, 'utf8')
}

let lib: Library
beforeAll(async () => { lib = await loadLibrary(read, [refOf({ id: 'gen:take-frame', folder: 'take-frame', note: 'takes a frame out of the hive' })!]) }, 60_000)

const MARK: MarkPlan = { at: [1.5, -9], yawDeg: 120 }
const MOVING = new Set(['start', 'travel', 'stop'])
const plan = (extra: Partial<PerformancePlan> = {}): PerformancePlan =>
  ({ path: standPath(MARK), stand: true, actions: [{ kind: 'move', at: 0, seconds: 1, motion: 'gen:take-frame' }], ...extra })

describe('a stand with one made move', () => {
  it('plays the move in and holds it: no start, travel or stop, and the take ends on the hold', () => {
    const tl = heroTimeline(plan(), lib)
    expect(tl.segs.some((g) => MOVING.has(g.kind))).toBe(false)
    expect(tl.segs[tl.segs.length - 1].kind).toBe('move-hold')
    expect(tl.segs.map((g) => g.kind)).not.toContain('move-out')
    expect(tl.duration).toBeLessThan(6) // the clip's way in (3.5 s) plus its 1 s hold: nothing walked after it
  })

  it('a 6 s shot stretches the hold to 6 s (plus the one-frame pad), still with no walk', () => {
    const tl = heroTimeline(plan({ shotSeconds: 6 }), lib)
    expect(tl.segs.some((g) => MOVING.has(g.kind))).toBe(false)
    expect(tl.segs[tl.segs.length - 1].kind).toBe('move-hold')
    expect(tl.duration).toBeGreaterThanOrEqual(6 + 1 / 24 - 1e-9)
    expect(tl.duration).toBeLessThanOrEqual(6 + 1 / 24 + 1 / 48 + 1e-9)
  })
})

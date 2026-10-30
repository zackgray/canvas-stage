// Track C: a plan may carry the subject's mark ({ at, yawDeg }); without one the mark is the start of the flat corridor.
import { describe, expect, it } from 'vitest'
import { markOf } from '../mark.ts'
import { parsePlan } from '../plan.ts'

const base = { seed: 1, flat: [-3, -16, 3, 8], sky: { url: '/lab-assets/sky/procedural' }, kit: [] }

describe('plan.mark', () => {
  it('parses, and is read back as given', () => {
    const r = parsePlan({ ...base, mark: { at: [2, -10], yawDeg: 45 } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(markOf(r.plan)).toEqual({ at: [2, -10], yawDeg: 45 })
  })
  it('is refused when malformed', () => {
    for (const mark of [{ at: [1] }, { at: [1, 2], yawDeg: 999 }, { at: [1, 2], z: 1 }, 'here', { at: [500, 0] }]) {
      const r = parsePlan({ ...base, mark })
      expect(r.ok, JSON.stringify(mark)).toBe(false)
    }
  })
  it('defaults to the corridor start: 3.5 m in from its far end, 0.6 m right of its middle', () => {
    expect(markOf({ flat: [-3, -16, 3, 8] })).toEqual({ at: [0.6, -12.5], yawDeg: 0 })
    expect(markOf({ flat: [-5, -30, 1, 8] })).toEqual({ at: [-1.4, -26.5], yawDeg: 0 })
    expect(markOf({})).toEqual({ at: [0.6, -12.5], yawDeg: 0 })
  })
})

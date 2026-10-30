// Recipe wave C3a: standing and looking extras on the kit performance (parsed field by field; a stander is one spot).
import { describe, expect, it } from 'vitest'
import type { ExtraPlan } from '../../../src/stage3d/contract.ts'
import { parsePerformancePlan } from '../perf.ts'

const PATH: [number, number][] = [[0.6, -12.5], [0.6, -8]]
const EX: ExtraPlan = { path: [[-6, -9], [6, -8.4]], gait: 'run', delay: 0.7, costume: 'plain', variant: 2 }
const STAND: ExtraPlan = { ...EX, path: [[3, -9]], stand: true, face: [0, -8], actions: [{ kind: 'look', at: 0, seconds: 2, deg: 40 }] }

describe('standing and looking extras', () => {
  it('keeps stand, face and actions, and a standing extra may be one point with no length', () => {
    expect(parsePerformancePlan({ path: PATH, extras: [{ ...STAND, junk: 1 }] })).toEqual({ ok: true, perf: { path: PATH, extras: [STAND] } })
  })
  it('a walking extra still needs two points; stand:false is the same as unset', () => {
    expect(parsePerformancePlan({ path: PATH, extras: [{ ...EX, path: [[3, -9]], stand: false }] }).ok).toBe(false)
    expect(parsePerformancePlan({ path: PATH, extras: [{ ...EX, stand: false }] })).toEqual({ ok: true, perf: { path: PATH, extras: [EX] } })
  })
  it('refuses a bad face, a bad action and a non-boolean stand', () => {
    const bad: [unknown, RegExp][] = [[{ ...STAND, face: [0] }, /face/], [{ ...STAND, face: [999, 0] }, /face/],
      [{ ...STAND, actions: [{ kind: 'dance', at: 0 }] }, /extras\[0\]\.actions\[0\]/], [{ ...STAND, stand: 'yes' }, /stand/]]
    for (const [e, msg] of bad) {
      const r = parsePerformancePlan({ path: PATH, extras: [e] })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors.join(' ')).toMatch(msg)
    }
  })
})

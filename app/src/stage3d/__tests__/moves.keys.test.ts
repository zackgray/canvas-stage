// The key builder (plan section 8 "Key builder"): the lift keys from a hive at rim 0.70 m and 0.36 m in front reproduce the
// spike's constraints/lift_hi_spec.json within 1 cm; an end key always sits within 0.3 s of the window's end; the grip clamps
// hold; an out-of-reach piece is refused with its distance.
import { describe, expect, it } from 'vitest'
import { clampGrip, keysFor, planMove, type MoveKey } from '../moves/index.ts'

// the spike's lift_hi_spec.json hand targets (frames 75/100/140/190/235, 30 fps), transcribed
const SPIKE_LIFT: [number, [number, number, number]][] = [
  [75, [0.21, 0.8, 0.42]],
  [100, [0.21, 1.02, 0.38]],
  [140, [0.21, 1.6, 0.4]],
  [190, [0.21, 1.62, 0.42]],
  [235, [0.21, 1.6, 0.4]],
]

/** the hive from the plan's worked example: rim 0.70 m, near face 0.36 m ahead of the point, 0.60 m wide */
const HIVE = { min: [-0.3, 0, 0.36] as [number, number, number], max: [0.3, 0.7, 0.76] as [number, number, number] }

const liftKeys = (): { keys: MoveKey[]; grab?: number } => {
  const r = planMove({ words: 'slowly takes a frame out of the hive', piece: { id: 'hive', name: 'hive', box: HIVE }, knownGrip: 0.42 })
  if (r.kind !== 'spec') throw new Error(`expected a spec, got ${r.kind}`)
  return r.spec
}

describe('the lift keys against the spike spec', () => {
  it('reproduces lift_hi_spec.json within 1 cm', () => {
    const { keys } = liftKeys()
    expect(keys).toHaveLength(5)
    keys.forEach((k, i) => {
      const [frame, [sx, sy, sz]] = SPIKE_LIFT[i]
      expect(k.frame).toBe(frame)
      expect(Math.abs(k.hands.Left[0] - sx)).toBeLessThanOrEqual(0.01)
      expect(Math.abs(k.hands.Left[1] - sy)).toBeLessThanOrEqual(0.01)
      expect(Math.abs(k.hands.Left[2] - sz)).toBeLessThanOrEqual(0.01)
      expect(k.hands.Right[0]).toBeCloseTo(-k.hands.Left[0], 9)
      expect(k.hands.Right[1]).toBeCloseTo(k.hands.Left[1], 9)
      expect(k.hands.Right[2]).toBeCloseTo(k.hands.Left[2], 9)
    })
  })
  it('carries the base pose names from the box bank', () => {
    const { keys } = liftKeys()
    expect(keys.map((k) => k.pose)).toEqual(['reach-low', 'reach-low', 'hold-high', 'hold-high', 'hold-high'])
  })
  it('grabs at the rim key (2.5 s) and holds to the end', () => {
    const { grab } = liftKeys()
    expect(grab).toBeCloseTo(2.5, 9)
  })
})

describe('the end key', () => {
  it('sits within 0.3 s of the window\'s end, whatever the window', () => {
    for (const seconds of [4, 6, 8, 10]) {
      const { keys } = keysFor('takeOut', { front: 0.36, rimOrTop: 0.7, grip: 0.42 }, seconds)
      const end = keys[keys.length - 1]
      expect(seconds - end.frame / 30).toBeLessThanOrEqual(0.3)
      expect(end.frame).toBeGreaterThan(keys[keys.length - 2].frame)
    }
  })
})

describe('the grip clamps', () => {
  it('clamps to 0.30..0.55 m whatever is measured', () => {
    expect(clampGrip(0.05)).toBe(0.3)
    expect(clampGrip(0.42)).toBe(0.42)
    expect(clampGrip(2)).toBe(0.55)
    for (const grip of [-1, 0, 0.29, 0.3, 0.55, 0.56, 9]) {
      const { keys } = keysFor('takeOut', { front: 0.36, rimOrTop: 0.7, grip }, 8)
      const half = keys[0].hands.Left[0]
      expect(half).toBeGreaterThanOrEqual(0.15)
      expect(half).toBeLessThanOrEqual(0.275)
    }
  })
})

describe('out of reach', () => {
  it('a piece beyond 0.75 m is refused with its distance', () => {
    const r = planMove({ words: 'takes a frame out of the hive', piece: { id: 'hive', name: 'hive', box: { min: [-0.3, 0, 2.2], max: [0.3, 0.7, 2.8] } } })
    expect(r.kind).toBe('refused')
    if (r.kind === 'refused') {
      expect(r.message).toBe('The hive is 2.2 m from this point. Put the point within arm\'s reach of it, or move the hive on the Set.')
    }
  })
  it('a piece at 0.75 m exactly is still reachable', () => {
    const r = planMove({ words: 'takes a frame out of the hive', piece: { id: 'hive', name: 'hive', box: { min: [-0.3, 0, 0.75], max: [0.3, 0.7, 1.15] } } })
    expect(r.kind).toBe('spec')
  })
})

describe('other classes key off the same machinery', () => {
  it('gestures send no keys: text only', () => {
    expect(keysFor('gesture', { front: 0.4, rimOrTop: 0.7, grip: 0.42 }, 8)).toEqual({ keys: [] })
  })
  it('pick up reaches low, rises to chest, holds, and ends near the window\'s end', () => {
    const { keys, grab, hold } = keysFor('pickUp', { front: 0.4, rimOrTop: 0, grip: 0.42 }, 8)
    expect(keys.map((k) => k.frame)).toEqual([60, 120, 165, 235])
    expect(keys[0].pose).toBe('reach-low')
    expect(keys[1].hands.Left[1]).toBeCloseTo(1.2, 9)
    expect(grab).toBeCloseTo(2, 9)
    expect(hold?.[1]).toBe(8)
  })
  it('put down releases at about 4.5 s and stands by the end', () => {
    const { keys, release } = keysFor('putDown', { front: 0.4, rimOrTop: 0.8, grip: 0.42 }, 8)
    expect(keys.map((k) => k.frame)).toEqual([15, 120, 135, 200, 235])
    expect(keys[2].hands.Left[1]).toBeCloseTo(0.86, 9)
    expect(release).toBeCloseTo(4.5, 9)
    expect(keys[3].pose).toBe('stand')
  })
})

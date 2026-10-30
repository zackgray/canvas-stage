import { describe, expect, it } from 'vitest'
import { along, arcLengths } from '../performer.ts'
import { parsePlan } from '../plan.ts'
import { BATTLEFIELD } from '../presets.ts'

describe('stage3d wave-0 contract', () => {
  it('walks a polyline by arc length, clamped at both ends', () => {
    const path: [number, number][] = [[0, 0], [0, -4], [3, -4]]
    const arcs = arcLengths(path)
    expect(arcs).toEqual([0, 4, 7])
    expect(along(path, arcs, 2).p.toArray()).toEqual([0, 0, -2])
    expect(along(path, arcs, 5.5).p.toArray()).toEqual([1.5, 0, -4])
    expect(along(path, arcs, 99).p.toArray()).toEqual([3, 0, -4])
    expect(along(path, arcs, -1).p.toArray()).toEqual([0, 0, 0])
  })
  it('the battlefield preset parses; an unknown kit piece is refused', () => {
    expect(parsePlan(BATTLEFIELD).ok).toBe(true)
    const bad = parsePlan({ ...BATTLEFIELD, kit: [{ kind: 'dragon', at: [0, 0] }] })
    expect(bad.ok).toBe(false)
  })
})

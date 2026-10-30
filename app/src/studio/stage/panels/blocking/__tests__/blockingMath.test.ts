// Track E1: Blocking's pure parts: the letterbox-true click mapping, actions anchored to path points, the footprint warning, the
// crossing presets and the draft <-> stored performance round trip.
import { describe, expect, it } from 'vitest'
import type { KitItem } from '../../../../../stage3d/contract'
import { WALK_TOWARD } from '../../../../../stage3d/presets'
import { footprintHits, groundPointAt, pointAtArc } from '../blockingMath'
import { changedFrom, draftFrom, planOf, reanchor, type EditAction } from '../blockingPlan'
import { crossingExtra } from '../crossings'

describe('top view click mapping', () => {
  it('maps through the meet letterbox, and a click in the bars is no point', () => {
    const box: [number, number, number, number] = [-10, -20, 10, 0] // 20 x 20 m in a 400 x 200 px element: drawn 200 px square, centred
    expect(groundPointAt(box, 400, 200, 200, 100)).toEqual([0, -10])
    expect(groundPointAt(box, 400, 200, 100, 0)).toEqual([-10, -20]) // the drawing's top-left corner
    expect(groundPointAt(box, 400, 200, 50, 100)).toBeNull() // in the left bar
    // Perform's mapping read this click as x = -7.5 m (fraction of the element), 2.5 m off
    expect(groundPointAt(box, 400, 200, 150, 100)).toEqual([-5, -10])
  })
})

describe('actions on path points', () => {
  const path: [number, number][] = [[0, 0], [0, -5], [4, -5]]
  it('a saved action finds the point it was placed on; one between points sits on none', () => {
    expect(pointAtArc(path, 5)).toBe(1)
    expect(pointAtArc(path, 9)).toBe(2)
    expect(pointAtArc(path, 3)).toBe(-1)
  })
  it('follow their point when the path changes, and go with it when it is removed', () => {
    const acts: EditAction[] = [{ kind: 'stop', point: 1, at: 5, seconds: 1 }, { kind: 'kneel', point: 2, at: 9, seconds: 2 }, { kind: 'look', point: -1, at: 3, deg: 30 }]
    const moved = reanchor(acts, [[0, 0], [0, -8], [4, -8]])
    expect(moved.map((a) => a.at)).toEqual([8, 12, 3])
    // point 2 is gone (its kneel with it); the free look at 3 m is past the 2 m end
    expect(reanchor(acts, [[0, 0], [0, -2]]).map((a) => [a.kind, a.at])).toEqual([['stop', 2]])
    expect(reanchor(acts, [[0, 0], [0, -4]]).map((a) => [a.kind, a.at])).toEqual([['stop', 4], ['look', 3]])
  })
})

describe('footprint warning', () => {
  it('names the kit pieces a path walks through, skips walk-through pieces and clear paths', () => {
    const kit: KitItem[] = [{ kind: 'crates', at: [0, -5] }, { kind: 'crates', at: [10, -5] }, { kind: 'crates', at: [0, -8], walkThrough: true }]
    expect(footprintHits(kit, [[0, 0], [0, -10]])).toEqual([0])
    expect(footprintHits(kit, [[-5, 0], [-5, -10]])).toEqual([])
    expect(footprintHits(kit, [[0, 0]])).toEqual([])
  })
  it('a kind that is only an Object prototype key (constructor, toString) is no piece: skipped, never thrown on', () => {
    const odd = [{ kind: 'constructor', at: [0, -5] }, { kind: 'toString', at: [0, -6] }, { kind: 'crates', at: [0, -7] }] as KitItem[]
    expect(footprintHits(odd, [[0, 0], [0, -10]])).toEqual([2])
  })
})

describe('crossing presets', () => {
  it('reproduce the spike walk-past set on the default walk (mirrored on alternate extras)', () => {
    const behind = crossingExtra('behind', WALK_TOWARD.path)
    expect(behind).toEqual({ path: [[-6.4, -15.5], [7.6, -14.5]], gait: 'run', delay: 0, costume: 'modern', variant: 0 })
    const front = crossingExtra('front', WALK_TOWARD.path, 1, 4)
    expect(front.path[0][0]).toBeLessThan(front.path[1][0])
    expect(front.variant).toBe(1)
    for (const id of ['front', 'overtake', 'behind', 'far'] as const) expect(crossingExtra(id, [[0, 0], [10, 0]]).path).toHaveLength(2)
  })
})

describe('draft and stored performance', () => {
  const saved = { path: [[0, 0], [0, -5], [4, -5]] as [number, number][], actions: [{ kind: 'stop' as const, at: 5, seconds: 1 }], castId: 'brann', costume: 'plain' as const }
  it('an untouched draft is no change, and saving it writes the same performance', () => {
    const d = draftFrom(saved)
    expect(changedFrom(saved, d)).toBe(false)
    expect(planOf(saved, d)).toEqual({ ...saved, pace: 0.8 })
  })
  it('an old performance with no actions, extras or gait gains none of those keys', () => {
    const old = { path: WALK_TOWARD.path, pace: 0.8 }
    expect(planOf(old, draftFrom(old))).toEqual(old)
  })
  it('a new path clears its actions; extras and the cast pick are written', () => {
    const d = { ...draftFrom(saved), path: [[1, 1], [1, -3]] as [number, number][], actions: [], extras: [crossingExtra('far', saved.path)], castId: 'sloane' }
    const p = planOf(saved, d)
    expect(p.actions).toEqual([])
    expect(p.extras).toHaveLength(1)
    expect(p.castId).toBe('sloane')
    expect(p.costume).toBe('plain')
    expect(changedFrom(saved, d)).toBe(true)
  })
})

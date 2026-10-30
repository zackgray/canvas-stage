// @vitest-environment jsdom
// Review F2: a parked performer is built on its set's ground (performer.ts closes over groundAt, from the plan's ground, seed and
// flat corridor) and on its pieces (a lift's hive), so the parked key carries all of those. Two sets that differ only in ground, only
// in seed or only in the flat corridor never share a figure; the same set reuses it. The review's three-switch sequence: scene A
// (flat) -> take B (A's pieces on other ground) -> take C (other pieces) -> back to A must give A's own figure back.
import { renderHook } from '@testing-library/react'
import { Group, Vector3 } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Performer3D, ScenePlan } from '../../../../stage3d/contract'
import { WALK_TOWARD } from '../../../../stage3d/presets'
import type { Stage } from '../../engine/Stage'
import type { KitLayer } from '../KitLayer'

const pending: ((p: Performer3D) => void)[] = []
vi.mock('../../../../stage3d/performer', () => ({ createPerformer: () => new Promise<Performer3D>((ok) => pending.push(ok)) }))
const { useMocap } = await import('../useMocap')
const { clearParkedPerformers, performerKey } = await import('../performerCache')

const figure = (): Performer3D => ({ object: new Group(), duration: 2, poseAt: () => {}, anchorAt: () => new Vector3(), headingAt: () => new Vector3(1, 0, 0) })
const stage = () => ({ world: { performance: null as unknown, clock: { time: 0, playing: false }, setPerformance(l: unknown) { this.performance = l } } }) as unknown as Stage
const WORLD = 'loc-2026-10-23T03-00-01-000'
const BASE: ScenePlan = { seed: 7, ground: 'flat', kit: [{ kind: 'tree', at: [1, 2] }] } as unknown as ScenePlan
const kitOf = (plan: ScenePlan) => ({ worldId: WORLD, groundAt: () => 0, plan }) as unknown as KitLayer
const shownFigure = (s: Stage) => (s.world.performance as unknown as { performer: Performer3D } | null)?.performer ?? null

afterEach(() => { clearParkedPerformers(); pending.length = 0 })

async function cycle(other: ScenePlan) {
  const s = stage()
  const A = kitOf(BASE), B = kitOf(other), C = kitOf({ ...BASE, kit: [{ kind: 'hive', at: [3, 4] }] } as unknown as ScenePlan)
  const { rerender } = renderHook(({ kit }) => useMocap(s, kit, WALK_TOWARD, true), { initialProps: { kit: A } })
  const fa = figure(); pending.shift()!(fa)
  await vi.waitFor(() => expect(shownFigure(s)).toBe(fa))
  for (const k of [B, C]) {
    rerender({ kit: k })
    expect(pending).toHaveLength(1) // a set of its own: built, never a parked figure from another ground
    const f = figure(); pending.shift()!(f)
    await vi.waitFor(() => expect(shownFigure(s)).toBe(f))
  }
  rerender({ kit: A }) // back to the scene: its own figure, built on its own ground
  await vi.waitFor(() => expect(shownFigure(s)).toBe(fa))
  expect(pending).toHaveLength(0)
}

describe('the parked performer is keyed on its ground (review F2)', () => {
  it('only the ground differs: never shared', () => cycle({ ...BASE, ground: 'rolling' } as ScenePlan))
  it('only the seed differs (rolling ground): never shared', async () => {
    const rolling = { ...BASE, ground: 'rolling' } as ScenePlan
    expect(performerKey(WALK_TOWARD, WORLD, rolling)).not.toBe(performerKey(WALK_TOWARD, WORLD, { ...rolling, seed: 8 }))
  })
  it('only the flat corridor differs: never shared', () => cycle({ ...BASE, flat: [-2, -10, 2, 4] } as ScenePlan))
  it('the seed alone, through the switch sequence', () => cycle({ ...BASE, seed: 8 } as ScenePlan))
  it('the same set (an equal plan, another object) reuses the figure', () => {
    expect(performerKey(WALK_TOWARD, WORLD, BASE)).toBe(performerKey(WALK_TOWARD, WORLD, JSON.parse(JSON.stringify(BASE)) as ScenePlan))
  })
})

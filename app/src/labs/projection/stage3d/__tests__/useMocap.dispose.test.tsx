// @vitest-environment jsdom
// Review m4: a 3D performer that finishes building after its plan changed or the world was left belongs to nobody; useMocap frees
// it then. And the one that was put on the stage is freed (geometries and its own skirt material) when the plan changes.
import { renderHook } from '@testing-library/react'
import { Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { Performer3D } from '../../../../stage3d/contract'
import { WALK_TOWARD } from '../../../../stage3d/presets'
import type { Stage } from '../../engine/Stage'
import type { KitLayer } from '../KitLayer'

const pending: ((p: Performer3D) => void)[] = []
vi.mock('../../../../stage3d/performer', () => ({ createPerformer: () => new Promise<Performer3D>((ok) => pending.push(ok)) }))
const { useMocap } = await import('../useMocap')
const { clearParkedPerformers, parkedCount } = await import('../performerCache')
const { holdPerformer } = await import('../../clay/layerGuard')

function figure() {
  const geo = new SphereGeometry(), mat = new MeshStandardMaterial(), object = new Group(); object.add(new Mesh(geo, mat))
  const p: Performer3D = { object, duration: 2, poseAt: () => {}, anchorAt: () => new Vector3(), headingAt: () => new Vector3(1, 0, 0) }
  return { p, geo: vi.spyOn(geo, 'dispose'), mat: vi.spyOn(mat, 'dispose') }
}
const stage = () => {
  const world = { performance: null as unknown, clock: { time: 2.5, playing: false }, setPerformance(l: unknown) { this.performance = l } }
  return { world } as unknown as Stage
}
const kit = { worldId: 'loc-2026-10-23T03-00-01-000', groundAt: () => 0 } as unknown as KitLayer

describe('useMocap frees the figures it builds', () => {
  it('a figure that resolves after the world was left is disposed, never put on the stage', async () => {
    const s = stage()
    const { unmount } = renderHook(() => useMocap(s, kit, WALK_TOWARD, true))
    unmount() // left before the build finished
    const f = figure()
    pending.shift()!(f.p)
    await Promise.resolve(); await Promise.resolve()
    expect(f.geo).toHaveBeenCalled()
    expect(f.mat).toHaveBeenCalled()
    expect(s.world.performance).toBeNull()
  })

  it('a new plan keeps her on the stage until the new figure is built, then frees the old one (material too)', async () => {
    const s = stage()
    const { rerender } = renderHook(({ perf }) => useMocap(s, kit, perf, true), { initialProps: { perf: WALK_TOWARD } })
    const f = figure()
    pending.shift()!(f.p)
    await vi.waitFor(() => expect(s.world.performance).not.toBeNull())
    const first = s.world.performance
    rerender({ perf: { ...WALK_TOWARD, pace: 1.37 } })
    expect(s.world.performance).toBe(first) // no gap: she stays while the new figure builds
    expect(f.geo).not.toHaveBeenCalled()
    const g = figure()
    pending.shift()!(g.p)
    await vi.waitFor(() => expect(s.world.performance).not.toBe(first))
    expect(f.geo).not.toHaveBeenCalled() // parked for a switch back, not freed
    expect(parkedCount()).toBe(1)
    clearParkedPerformers() // the cache frees what it holds
    expect(f.geo).toHaveBeenCalled()
    expect(f.mat).toHaveBeenCalled()
  })

  it('switching back to a walk reuses the built figure (no second build) in a NEW layer, and the capture guard still aborts', async () => {
    clearParkedPerformers()
    const s = stage()
    const B = { ...WALK_TOWARD, pace: 1.37 }
    const { rerender } = renderHook(({ perf }) => useMocap(s, kit, perf, true), { initialProps: { perf: WALK_TOWARD } })
    const fa = figure()
    pending.shift()!(fa.p)
    await vi.waitFor(() => expect(s.world.performance).not.toBeNull())
    const layerA = s.world.performance
    const held = holdPerformer(s) // a capture of A starts
    rerender({ perf: B })
    pending.shift()!(figure().p)
    await vi.waitFor(() => expect(s.world.performance).not.toBe(layerA))
    rerender({ perf: WALK_TOWARD }) // back to A: parked figure, createPerformer not called again
    await vi.waitFor(() => expect((s.world.performance as unknown as { performer: unknown }).performer).toBe(fa.p))
    expect(pending).toHaveLength(0)
    expect(s.world.performance).not.toBe(layerA) // a distinct layer, so the guard sees the switch
    expect(() => held.check()).toThrow()
    expect(fa.geo).not.toHaveBeenCalled()
    clearParkedPerformers()
  })

  it('Play here: the audition figure plays from the start at once; when it ends the clock goes back to the start and stops', async () => {
    const s = stage()
    const clock = (s.world as unknown as { clock: { time: number; playing: boolean } }).clock
    const { rerender } = renderHook(({ perf, audition }) => useMocap(s, kit, perf, true, audition), { initialProps: { perf: WALK_TOWARD, audition: false } })
    pending.shift()!(figure().p)
    await vi.waitFor(() => expect(s.world.performance).not.toBeNull())
    expect(clock).toEqual({ time: 2.5, playing: false }) // the saved performance leaves the clock alone
    rerender({ perf: { ...WALK_TOWARD, pace: 1.1 }, audition: true })
    pending.shift()!(figure().p)
    await vi.waitFor(() => expect(clock.playing).toBe(true))
    expect(clock.time).toBe(0)
    clock.time = 3
    rerender({ perf: WALK_TOWARD, audition: false }) // the saved walk's figure is parked: back without a rebuild
    await vi.waitFor(() => expect(clock.playing).toBe(false))
    expect(clock.time).toBe(0)
  })
})

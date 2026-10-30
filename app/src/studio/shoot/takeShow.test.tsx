// @vitest-environment jsdom
// Per-take performance, the page side (PLAN-PER-TAKE-PERFORMANCE.md WP3): picking a locked take puts its own walk on the stage
// (the scene's cast laid over it); the subject panel's first edit to the scene's walk sets that take aside and no restore brings
// it back until it is picked again; a recast is no edit; the draw's prepare waits for the take's walk; Lock sends the walk the
// stage plays, and a recording in memory locked again with a new walk is a new take.
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OperatorEngine } from '../../labs/controller/engine/engine'
import { fakeTake } from '../../labs/projection/clay/__fixtures__/take'
import type { BankShot } from '../../labs/projection/engine/manifest'
import { STAGE_RIGS } from '../../labs/projection/operator/link'
import { KIT_CHANGED } from '../../labs/projection/stage3d/kitApi'
import { resetTakeOnShow, takeOnShow } from '../../labs/projection/stage3d/takeOnShow'
import { useKit, type KitState } from '../../labs/projection/stage3d/useKit'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { startKey, type TakeLockRequest, type TakeRecord } from '../../shared/shotContract'
import type { PerformancePlan } from '../../stage3d/contract'
import { mocapPackId, planHash } from '../../stage3d/planHash'
import { StageTakeRestore } from '../stage/StageTakeRestore'
import { currentTakeId, resetCurrentTake } from './currentTake'
import { useStillPrep } from './stillPrep'
import { depthReady, resetClayStore } from './takeClay'
import { useTakeLock } from './takeLock'
import { resetTakeShow, stagePackId } from './takeShow'
import { pickTake, resetLockedTakes } from './worldTakes'

const W = 'loc-1'
const WALK_UP: PerformancePlan = { path: [[0, 0], [0, -6]], pace: 1, gait: 'walk' }
const STAND: PerformancePlan = { path: [[0, 0], [0, -0.5]], stand: true, shotSeconds: 6 }
const rec = (id: string, perf: PerformancePlan, lockedAt: string): TakeRecord => ({ id, worldId: W, packId: mocapPackId(perf), fps: 24, frames: 97,
  samples: [], focal: 35, viewAspect: 1.77, perfStart: 0, startKey: `k-${id}`, lockedAt, createdAt: lockedAt, perf, perfFrom: 'lock' })
const T1 = rec('take-1', WALK_UP, '2026-10-29T10:00:00.000Z')
const T2 = rec('take-2', { ...WALK_UP, pace: 1.2 }, '2026-10-29T11:00:00.000Z')

let scene: PerformancePlan & { castId?: string }
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status })
beforeEach(() => {
  resetCurrentTake(); resetLockedTakes(); resetTakeOnShow(); resetTakeShow(); resetClayStore()
  scene = { ...T2.perf!, castId: 'ana' } // the scene's walk is the newest take's, the hero cast as Ana
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/__lab/takes') return json({ takes: [T2, T1] })
    if (url.startsWith('/__lab/stage3d/world?id=')) return json({ id: W, plan: { kit: [] }, perf: scene, still: null })
    return json({}, 404)
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetLockedTakes(); resetTakeOnShow(); resetTakeShow() })

const engine = () => new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false })
function mountStage() {
  const seen: { kit: KitState | null } = { kit: null }
  const e = engine()
  function Harness() {
    const kit = useKit(null, { id: W, kind: 'kit' } as unknown as BankShot)
    seen.kit = kit
    return <StageTakeRestore lab={{ s: { source: W }, op: { engine: e }, kit } as unknown as ProjectionLabState} />
  }
  render(<Harness />)
  return seen
}
/** the subject panel saved the scene's walk (the server wrote performance.json; the page re-reads it) */
const sceneSaved = (next: typeof scene) => act(() => { scene = next; window.dispatchEvent(new CustomEvent(KIT_CHANGED, { detail: { id: W } })) })
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 120)) })

describe('a locked take keeps its own walk on the stage', () => {
  it('picking a take puts its own walk on the stage, with the scene\'s cast; the subject panel still edits the scene\'s', async () => {
    const seen = mountStage()
    await waitFor(() => expect(currentTakeId()).toBe(T2.id)) // a reload restores the newest
    await waitFor(() => expect(seen.kit?.world).not.toBeNull())
    act(() => pickTake(T1.id))
    await waitFor(() => expect(seen.kit?.onShow?.takeId).toBe(T1.id))
    expect(planHash(seen.kit!.perf!)).toBe(planHash(WALK_UP))
    expect(`mocap-${planHash(seen.kit!.perf!)}`).toBe(T1.packId)
    expect((seen.kit!.perf as { castId?: string }).castId).toBe('ana')
    expect(seen.kit!.world!.perf).toEqual(scene) // what Blocking, Walk to and the shot length edit
  })

  it('the first edit to the scene\'s walk sets the take aside, and no restore brings it back; a click on it does', async () => {
    const seen = mountStage()
    await waitFor(() => expect(seen.kit?.world).not.toBeNull())
    act(() => pickTake(T1.id))
    await waitFor(() => expect(seen.kit?.onShow?.takeId).toBe(T1.id))
    await sceneSaved({ ...STAND, castId: 'ana' })
    await waitFor(() => expect(takeOnShow()).toBeNull())
    expect(currentTakeId()).toBeNull()
    await settle()
    expect(currentTakeId()).toBeNull() // not T1 again, and not the newest (T2) either
    expect(planHash(seen.kit!.perf!)).toBe(planHash(STAND)) // the stage plays the walk just made
    act(() => pickTake(T1.id))
    await waitFor(() => expect(seen.kit?.onShow?.takeId).toBe(T1.id))
    expect(planHash(seen.kit!.perf!)).toBe(planHash(WALK_UP))
  })

  it('a save that only recasts the hero sets nothing aside', async () => {
    const seen = mountStage()
    await waitFor(() => expect(seen.kit?.world).not.toBeNull())
    act(() => pickTake(T1.id))
    await waitFor(() => expect(seen.kit?.onShow?.takeId).toBe(T1.id))
    await sceneSaved({ ...scene, castId: 'bo' })
    await waitFor(() => expect(seen.kit?.world?.perf.castId).toBe('bo'))
    await settle()
    expect(currentTakeId()).toBe(T1.id)
    expect(seen.kit?.onShow?.takeId).toBe(T1.id)
    expect((seen.kit!.perf as { castId?: string }).castId).toBe('bo') // the new cast plays the take's walk
  })
})

describe('preparing a take\'s frames', () => {
  it('ensure puts the take\'s walk on the stage and waits for its performer before preparing', async () => {
    const world = { performance: { pack: { id: mocapPackId(STAND), fps: 24, frames: 144 } } as { pack: { id: string; fps: number; frames: number } } | null }
    const lab = { stage: { world, view: { aspect: 1.77 } }, s: { source: W }, performance: { layer: world.performance } } as unknown as ProjectionLabState
    const at: { pack: string | null; onShow: string | null }[] = []
    const prepare = vi.fn(async () => { at.push({ pack: stagePackId(lab.stage), onShow: takeOnShow()?.takeId ?? null }); return null })
    const { result } = renderHook(() => useStillPrep(lab, T1, true, () => {}, prepare))
    let done: Promise<boolean> | null = null
    act(() => { done = result.current.ensure() })
    expect(takeOnShow()?.takeId).toBe(T1.id) // the take's walk is asked for at once
    await act(async () => { await new Promise((r) => setTimeout(r, 80)) })
    expect(prepare).not.toHaveBeenCalled() // the stage still plays another walk: nothing is prepared from it
    world.performance = { pack: { id: T1.packId!, fps: 24, frames: 97 } } // the figure is built
    await act(async () => { await done })
    expect(at).toEqual([{ pack: T1.packId, onShow: T1.id }])
  })
})

describe('Lock take sends the walk on the stage', () => {
  const take = fakeTake(0.5)
  const packOf = (p: PerformancePlan) => ({ id: mocapPackId(p), fps: 24, frames: 400 })

  it('sends the performer\'s own plan; a recording in memory locked again with a changed walk is a new take', async () => {
    const sent: Record<string, unknown>[] = []
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/__lab/takes') return json({ takes: [] })
      const q = JSON.parse(init!.body as string) as TakeLockRequest & Record<string, unknown>
      sent.push(q)
      return json({ take: { ...q, id: `take-${sent.length}`, startKey: startKey(q.samples[0], q.focal, q.perfStart), lockedAt: 'x', createdAt: 'x' } }, 201)
    }) as unknown as typeof fetch
    let perf: PerformancePlan = WALK_UP
    const { result, rerender } = renderHook(() => useTakeLock(take, packOf(perf), W, 1.5, f, undefined, null, perf))
    await act(async () => { await result.current.lock() })
    expect(sent[0].packId).toBe(mocapPackId(WALK_UP))
    expect(JSON.stringify(sent[0].perf)).toBe(JSON.stringify(WALK_UP)) // exactly as the page holds it
    expect(currentTakeId()).toBe('take-1')
    perf = STAND // the subject panel changed the walk; the hand-flown camera in memory is the same
    rerender()
    expect(result.current.changed).toBe(true)
    await act(async () => { await result.current.lock() })
    expect(sent[1].packId).toBe(mocapPackId(STAND))
    expect(JSON.stringify(sent[1].perf)).toBe(JSON.stringify(STAND))
    expect(sent[1].samples).toEqual(sent[0].samples)
    expect(result.current.locked?.id).toBe('take-2')
    expect(currentTakeId()).toBe('take-2')
  })

  it('sends no walk when the plan is not the pack\'s (nothing to vouch for)', async () => {
    const sent: Record<string, unknown>[] = []
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/__lab/takes') return json({ takes: [] })
      sent.push(JSON.parse(init!.body as string))
      return json({ take: { id: 'take-1', worldId: W, startKey: 'k' } }, 201)
    }) as unknown as typeof fetch
    const { result } = renderHook(() => useTakeLock(take, packOf(WALK_UP), W, 1.5, f, undefined, null, STAND))
    await act(async () => { await result.current.lock() })
    expect(sent[0]).not.toHaveProperty('perf')
  })
})

describe('frames stamped with another walk are not prepared', () => {
  it('a clay stamped for another pack id is not ready; an unstamped older clay is', () => {
    const c = { takeId: T1.id, startKey: T1.startKey, mp4: null, frames: 97, width: 1920 as const, height: 1088 as const, status: 'done' as const, depth: {} as never }
    expect(depthReady({ ...c, packId: 'mocap-other' }, T1)).toBe(false)
    expect(depthReady({ ...c, packId: T1.packId }, T1)).toBe(true)
    expect(depthReady(c, T1)).toBe(true)
  })
})

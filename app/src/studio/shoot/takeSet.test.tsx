// @vitest-environment jsdom
// Per-take set, the page side (PLAN-PER-TAKE-SET.md S3): picking a locked take puts its own set on the stage (every reader of the
// kit world sees it); while that set is not the scene's every set editor is read-only and an edit is refused unsent, and "Edit the
// scene's set" sets the take aside; an edit while a take whose set IS the scene's is on show goes through and sets the take aside,
// and no restore brings it back; a re-read of the scene (a piece landing) never moves the take's set; Lock sends the set on the
// stage; a clay stamped on another set is not prepared; Draw and Record wait for the right set.
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OperatorEngine } from '../../labs/controller/engine/engine'
import { fakeTake } from '../../labs/projection/clay/__fixtures__/take'
import type { BankShot } from '../../labs/projection/engine/manifest'
import { STAGE_RIGS } from '../../labs/projection/operator/link'
import type { StageOperatorEngine } from '../../labs/projection/operator/stageEngine'
import { KIT_CHANGED, resetKitPlan, saveKitGround } from '../../labs/projection/stage3d/kitApi'
import { SET_READ_ONLY, SetReadOnlyError } from '../../labs/projection/stage3d/setEditGate'
import { resetTakeOnShow, takeOnShow } from '../../labs/projection/stage3d/takeOnShow'
import { useKit, type KitState } from '../../labs/projection/stage3d/useKit'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import type { TakeRecord } from '../../shared/shotContract'
import type { ScenePlan } from '../../stage3d/contract'
import { placeApi } from '../scene/setPlaceApi'
import { useSetPlace } from '../scene/useSetPlace'
import { movePiece } from '../stage/panels/blocking/usePieceDrag'
import { StageTakeRestore } from '../stage/StageTakeRestore'
import { recordOnSceneWalk } from '../stage/takePerformer'
import { currentTakeId, resetCurrentTake } from './currentTake'
import { lockSetOf } from './lockSet'
import { setKeyOf } from './setKey'
import { useStillPrep } from './stillPrep'
import { depthReady, resetClayStore } from './takeClay'
import { useTakeLock } from './takeLock'
import { resetTakeShow, setTakeAside } from './takeShow'
import { pickTake, resetLockedTakes } from './worldTakes'

const W = 'loc-1'
const plan = (x: number, more: object[] = []) => ({ seed: 1, kit: [{ kind: 'crate', at: [x, -4] }, ...more], mark: { at: [0, 0], yawDeg: 0 } }) as unknown as ScenePlan
const SCENE = plan(1)
const OLD = plan(3) // the prop moved since T1 was locked
const LANDED = plan(1, [{ kind: 'barrel', at: [4, -2] }]) // a piece built on the scene's set while a take is on show
const rec = (id: string, set: ScenePlan | undefined, key: string, lockedAt: string): TakeRecord => ({ id, worldId: W, packId: null, fps: 24, frames: 97,
  samples: [], focal: 35, viewAspect: 1.77, perfStart: 0, startKey: `k-${id}`, lockedAt, createdAt: lockedAt, setKey: key, ...(set ? { set, setFrom: 'lock' as const } : {}) })
const T1 = rec('take-1', OLD, setKeyOf(OLD)!, '2026-10-29T10:00:00.000Z')
const T2 = rec('take-2', SCENE, setKeyOf(SCENE)!, '2026-10-29T11:00:00.000Z')
/** a take on the scene's set whose adopted copy has not been read yet */
const T3 = rec('take-3', undefined, setKeyOf(SCENE)!, '2026-10-29T09:00:00.000Z')

let scene: ScenePlan
let takes: TakeRecord[]
let writes: string[]
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status })
beforeEach(() => {
  resetCurrentTake(); resetLockedTakes(); resetTakeOnShow(); resetTakeShow(); resetClayStore()
  scene = SCENE; takes = [T2, T1, T3]; writes = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/__lab/takes') return json({ takes })
    if (url.startsWith('/__lab/stage3d/world?id=')) return json({ id: W, plan: scene, perf: { path: [[0, 0], [0, -6]] }, still: null })
    if (init?.method === 'POST' && url.startsWith('/__lab/stage3d/')) { writes.push(url); return json({ id: W, plan: scene, perf: {} }) }
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
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 120)) })
async function showing(seen: { kit: KitState | null }, id: string) {
  await waitFor(() => expect(seen.kit?.world).not.toBeNull())
  act(() => pickTake(id))
  await waitFor(() => expect(seen.kit?.onShow?.takeId).toBe(id))
}

describe('a picked take shows its own set', () => {
  it('a take with a moved prop: every reader of the world sees its set; the scene\'s stays apart, read-only is on', async () => {
    const seen = mountStage()
    await waitFor(() => expect(currentTakeId()).toBe(T2.id)) // the newest, on the scene's set
    await waitFor(() => expect(seen.kit?.world?.plan).toEqual(SCENE))
    expect(seen.kit!.ownSet).toBeNull()
    await showing(seen, T1.id)
    expect(seen.kit!.world!.plan).toEqual(OLD)
    expect(seen.kit!.scenePlan).toEqual(SCENE)
    expect(seen.kit!.ownSet?.takeId).toBe(T1.id)
  })

  it('a take whose set is the scene\'s keeps the scene\'s own object (no rebuild) and the set editable', async () => {
    const seen = mountStage()
    await waitFor(() => expect(seen.kit?.onShow?.takeId).toBe(T2.id))
    expect(seen.kit!.ownSet).toBeNull()
    expect(seen.kit!.world!.plan).toBe(seen.kit!.scenePlan)
  })
})

describe('the set is read-only while a take with another set is on show', () => {
  it('every set write is refused unsent; the Set\'s own state moves nothing and says why', async () => {
    const seen = mountStage()
    await showing(seen, T1.id)
    await expect(movePiece(W, 0, 'crate', [5, -4], 0)).rejects.toBeInstanceOf(SetReadOnlyError)
    await expect(placeApi.edit(W, 0, 'crate', { scale: 1.2 })).rejects.toBeInstanceOf(SetReadOnlyError)
    await expect(placeApi.mark(W, [1, 1], 0)).rejects.toBeInstanceOf(SetReadOnlyError)
    await expect(resetKitPlan(W)).rejects.toBeInstanceOf(SetReadOnlyError)
    await expect(saveKitGround(W, 'flat')).rejects.toBeInstanceOf(SetReadOnlyError)
    const { result } = renderHook(() => useSetPlace(seen.kit!.world))
    act(() => result.current.setLive(0, { at: [9, 9], yaw: 0 }))
    expect(result.current.poses).toEqual({})
    await act(async () => { await result.current.drop(0, { at: [5, -4], yaw: 0 }) })
    expect(result.current.error).toBe(SET_READ_ONLY)
    expect(writes).toEqual([])
    expect(takeOnShow()?.takeId).toBe(T1.id) // the refusal set nothing aside
  })

  it('Edit the scene\'s set sets the take aside: the scene\'s set is back and editable', async () => {
    const seen = mountStage()
    await showing(seen, T1.id)
    act(() => { setTakeAside(W) })
    await waitFor(() => expect(seen.kit?.ownSet).toBeNull())
    expect(seen.kit!.world!.plan).toEqual(SCENE)
    await movePiece(W, 0, 'crate', [5, -4], 0)
    expect(writes).toHaveLength(1)
  })
})

describe('an edit while a take on the scene\'s set is on show', () => {
  it('goes through and sets the take aside; no restore brings it back, a remount (reload) neither', async () => {
    const seen = mountStage()
    await waitFor(() => expect(seen.kit?.onShow?.takeId).toBe(T2.id))
    await placeApi.edit(W, 0, 'crate', { scale: 1.2 })
    expect(writes).toHaveLength(1)
    expect(takeOnShow()).toBeNull()
    expect(currentTakeId()).toBeNull()
    await settle()
    expect(currentTakeId()).toBeNull()
    cleanup(); resetCurrentTake(); resetLockedTakes(); resetTakeOnShow()
    mountStage()
    await settle()
    expect(currentTakeId()).toBeNull()
    expect(takeOnShow()).toBeNull()
  })
})

describe('a scene re-read never moves the set of the take on show', () => {
  it('a piece landing (KIT_CHANGED) keeps the take\'s own set on the stage', async () => {
    const seen = mountStage()
    await showing(seen, T1.id)
    await act(async () => { scene = LANDED; window.dispatchEvent(new CustomEvent(KIT_CHANGED, { detail: { id: W } })) })
    await waitFor(() => expect(seen.kit?.scenePlan).toEqual(LANDED))
    expect(seen.kit!.world!.plan).toEqual(OLD)
    expect(takeOnShow()?.plan).toEqual(OLD)
  })

  it('a take on the scene\'s set without its copy yet holds that set when a piece lands, and goes read-only', async () => {
    const seen = mountStage()
    await showing(seen, T3.id)
    expect(seen.kit!.ownSet).toBeNull()
    await act(async () => { scene = LANDED; window.dispatchEvent(new CustomEvent(KIT_CHANGED, { detail: { id: W } })) })
    await waitFor(() => expect(seen.kit?.scenePlan).toEqual(LANDED))
    await settle()
    expect(seen.kit!.world!.plan).toEqual(SCENE)
    expect(seen.kit!.ownSet?.takeId).toBe(T3.id)
  })
})

describe('Lock take sends the set on the stage', () => {
  it('sends the plan exactly as the page holds it, beside its key', async () => {
    const sent: Record<string, unknown>[] = []
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/__lab/takes') return json({ takes: [] })
      sent.push(JSON.parse(init!.body as string))
      return json({ take: { id: 'take-9', worldId: W, startKey: 'k' } }, 201)
    }) as unknown as typeof fetch
    const { result } = renderHook(() => useTakeLock(fakeTake(0.5), null, W, 1.5, f, undefined, OLD, null))
    await act(async () => { await result.current.lock() })
    expect(sent[0].setKey).toBe(setKeyOf(OLD))
    expect(JSON.stringify(sent[0].set)).toBe(JSON.stringify(OLD))
  })
  it('sends no set it cannot vouch for', () => {
    expect(lockSetOf('00000000', OLD)).toEqual({})
    expect(lockSetOf(null, OLD)).toEqual({})
  })
})

describe('frames stamped on another set are not prepared', () => {
  it('a clay stamped with another set key is not ready; the take\'s key and an unstamped older clay are', () => {
    const c = { takeId: T1.id, startKey: T1.startKey, mp4: null, frames: 97, width: 1920 as const, height: 1088 as const, status: 'done' as const, depth: {} as never }
    expect(depthReady({ ...c, setKey: setKeyOf(SCENE) }, T1)).toBe(false)
    expect(depthReady({ ...c, setKey: T1.setKey }, T1)).toBe(true)
    expect(depthReady(c, T1)).toBe(true)
  })
})

describe('Draw and Record wait for the right set', () => {
  it('ensure puts the take\'s set on the stage and prepares nothing until it is built', async () => {
    const kit = { plan: SCENE as ScenePlan, ready: Promise.resolve() }
    const lab = { stage: { kit, world: { performance: null }, view: { aspect: 1.77 } }, s: { source: W }, performance: { layer: null } } as unknown as ProjectionLabState
    const prepare = vi.fn(async () => null)
    const { result } = renderHook(() => useStillPrep(lab, T1, true, () => {}, prepare))
    let done: Promise<boolean> | null = null
    act(() => { done = result.current.ensure() })
    expect(takeOnShow()?.takeId).toBe(T1.id)
    await act(async () => { await new Promise((r) => setTimeout(r, 80)) })
    expect(prepare).not.toHaveBeenCalled()
    kit.plan = OLD // the take's set is built
    await act(async () => { await done })
    expect(prepare).toHaveBeenCalledTimes(1)
  })

  it('Record with another set on show sets the take aside and starts once the scene\'s set is on the stage', async () => {
    const seen = mountStage()
    await showing(seen, T1.id)
    const stage = { kit: { plan: OLD as ScenePlan, ready: Promise.resolve() } }
    const toggle = vi.fn()
    const e = { deck: { recording: false }, move: null, toggleRecording: toggle, flash: vi.fn() } as unknown as StageOperatorEngine
    recordOnSceneWalk(e, { stage: () => stage as never, worldId: () => W, scenePerf: () => null, scenePlan: () => SCENE })
    e.toggleRecording()
    expect(takeOnShow()).toBeNull()
    await act(async () => { await new Promise((r) => setTimeout(r, 80)) })
    expect(toggle).not.toHaveBeenCalled()
    stage.kit.plan = SCENE
    await waitFor(() => expect(toggle).toHaveBeenCalledTimes(1))
  })
})

// @vitest-environment jsdom
// Per-take set, the joining track's three page seams (PLAN-PER-TAKE-SET.md, Risk 5): while a locked take with its own other set is
// on show, the paid "Build in 3D" is off up front and refused unsent (it would land in the scene's set unseen); a rail add or a drawn
// prop is told why in the gate's words; and the first change to the walk's draft sets the take aside, so Blocking, Walk to and the
// mark readout measure against the scene's set the walk is saved on. A take on show whose set IS the scene's changes none of this.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KitWorld } from '../../labs/projection/stage3d/kitApi'
import { SET_READ_ONLY, SetReadOnlyError } from '../../labs/projection/stage3d/setEditGate'
import { noteSceneSet, resetTakeOnShow, setTakeOnShow, takeOnShow } from '../../labs/projection/stage3d/takeOnShow'
import type { ScenePlan } from '../../stage3d/contract'
import type { PiecesApi } from '../scene/piecesApi'
import { usePieces, type StillDeps } from '../scene/usePieces'
import type { PlaceApi } from '../scene/setPlaceApi'
import { useSetPlace } from '../scene/useSetPlace'
import { useBlocking } from '../stage/panels/blocking/useBlocking'
import { setKeyOf } from './setKey'
import { resetTakeShow } from './takeShow'

const W = 'loc-1'
const plan = (x: number) => ({ seed: 1, kit: [{ kind: 'crate', at: [x, -4] }], mark: { at: [0, 0], yawDeg: 0 } }) as unknown as ScenePlan
const SCENE = plan(1), OWN = plan(3)
const world = { id: W, plan: SCENE, perf: { path: [[0, 0], [0, -6]] }, still: null } as unknown as KitWorld
/** a locked take on show holding `set` (the scene's set as read is SCENE) */
const show = (set: ScenePlan) => { noteSceneSet(W, SCENE); setTakeOnShow({ takeId: 'take-1', worldId: W, perf: null, plan: set, setKey: setKeyOf(set) }) }

const tile = { tag: 'barrel', status: 'idle' } as never
function piecesApi() {
  const built: string[] = []
  const api: PiecesApi = {
    get: async () => ({ tiles: [tile], price: 30 }) as never,
    build: async (_w, tag) => { built.push(tag); return {} as never },
    recover: async () => ({}) as never, complete: async () => ({}) as never,
  }
  return { api, built }
}
const still: StillDeps = { read: async () => world, render: async () => new Blob(), upload: async () => null }

beforeEach(() => { resetTakeOnShow(); resetTakeShow(); vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 }))) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetTakeOnShow(); resetTakeShow() })

describe('Build in 3D while a take with its own set is on show', () => {
  it('is off up front and refused unsent; on the scene\'s set it goes through', async () => {
    const { api, built } = piecesApi()
    show(OWN)
    const { result } = renderHook(() => usePieces(W, api, still))
    await waitFor(() => expect(result.current.data).not.toBeNull())
    expect(result.current.setReadOnly).toBe(true)
    await act(async () => { await result.current.build(tile) })
    expect([built, result.current.error]).toEqual([[], SET_READ_ONLY])
    expect(takeOnShow()?.takeId).toBe('take-1') // refused, not set aside
    act(() => show(SCENE)) // a take whose set is the scene's: the build goes through and sets the take aside
    await waitFor(() => expect(result.current.setReadOnly).toBe(false))
    await act(async () => { await result.current.build(tile) })
    expect([built, takeOnShow()]).toEqual([['barrel'], null])
  })
})

describe('a rail add or a drawn prop while a take with its own set is on show', () => {
  it('is refused unsent and throws the gate\'s words to a caller that says it elsewhere', async () => {
    const add = vi.fn(async () => {})
    show(OWN)
    const { result } = renderHook(() => useSetPlace(world, { ...({} as PlaceApi), add } as PlaceApi))
    let thrown: unknown = null
    await act(async () => { await result.current.add('crate', [2, -2], 'a stand-in', 'prop:barrel', { throws: true }).catch((e: unknown) => { thrown = e }) })
    expect(thrown).toBeInstanceOf(SetReadOnlyError)
    expect((thrown as Error).message).toBe(SET_READ_ONLY)
    let landed: boolean | null = null
    await act(async () => { landed = await result.current.add('crate', [2, -2]) })
    expect([landed, result.current.error, add.mock.calls.length]).toEqual([false, SET_READ_ONLY, 0])
  })
})

describe('the walk\'s draft while a take with its own set is on show', () => {
  it('the first change sets the take aside; with the scene\'s set on show the draft edit leaves it (the save does that, as before)', () => {
    show(SCENE)
    const same = renderHook(() => useBlocking(world))
    act(() => same.result.current.hero.setPace(1.1))
    expect(takeOnShow()?.takeId).toBe('take-1')
    same.unmount()
    show(OWN)
    const { result } = renderHook(() => useBlocking(world))
    act(() => result.current.hero.setPace(1.2))
    expect(takeOnShow()).toBeNull()
  })
})

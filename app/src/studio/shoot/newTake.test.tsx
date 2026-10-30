// @vitest-environment jsdom
// New take (owner 10-29): it starts an open take from what is on screen and records nothing. A locked take on show with its own
// walk and set has them copied into the scene first (the set, then the walk, each sent as the page holds it, through the server's
// own writers), then the take is set aside: no take is current, the scene's setup is on show and editable, the open take is open,
// the take in memory leaves the deck. A refused copy leaves everything as it was. The take leaving the deck never comes back as
// current (the lock's restore loop), and a lock closes the open take.
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeTake } from '../../labs/projection/clay/__fixtures__/take'
import { readOnlySet } from '../../labs/projection/stage3d/setEditGate'
import { noteSceneSet, resetTakeOnShow, setTakeOnShow, takeOnShow, takeOnShowOf } from '../../labs/projection/stage3d/takeOnShow'
import { startKey, type TakeLockRequest, type TakeRecord } from '../../shared/shotContract'
import type { PerformancePlan, ScenePlan } from '../../stage3d/contract'
import { PLANS } from '../../stage3d/presets'
import { mocapPackId } from '../../stage3d/planHash'
import { currentTakeId, resetCurrentTake, setCurrentTake } from './currentTake'
import { startNewTake } from './newTake'
import { openTakeOn, resetOpenTake, setOpenTake } from './openTake'
import { setKeyOf } from './setKey'
import { useTakeLock } from './takeLock'
import { resetTakeShow, sceneWalkOn } from './takeShow'
import { resetLockedTakes } from './worldTakes'

const W = 'loc-1'
const SCENE_SET: ScenePlan = PLANS['open-field-day']
const T1_SET: ScenePlan = { ...SCENE_SET, kit: SCENE_SET.kit.slice(1) } // a piece moved off the set for T1
const SCENE_WALK: PerformancePlan & { castId?: string } = { path: [[0, 0], [0, -6]], pace: 1.2, gait: 'walk', castId: 'ana' }
const T1_WALK: PerformancePlan = { path: [[0, 0], [0, -6]], pace: 1, gait: 'walk' }
const T1: TakeRecord = { id: 'take-1', worldId: W, packId: mocapPackId(T1_WALK), fps: 24, frames: 97, samples: [], focal: 35, viewAspect: 1.77,
  perfStart: 0, startKey: 'k1', lockedAt: '2026-10-29T10:00:00.000Z', createdAt: '2026-10-29T10:00:00.000Z',
  perf: T1_WALK, perfFrom: 'lock', set: T1_SET, setFrom: 'lock', setKey: setKeyOf(T1_SET)! }

const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status })
beforeEach(() => {
  resetCurrentTake(); resetLockedTakes(); resetTakeOnShow(); resetTakeShow(); resetOpenTake(); localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => json({ takes: [] })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetTakeOnShow(); resetTakeShow(); resetOpenTake(); localStorage.clear() })

/** T1 picked: it is current and its own walk and set are on show (its set read-only: not the scene's) */
function showT1() {
  noteSceneSet(W, SCENE_SET)
  setCurrentTake(T1.id, true)
  setTakeOnShow(takeOnShowOf(T1))
}
const deckOf = () => ({ recording: false, take: fakeTake(0.5) as unknown, playback: null as unknown })

describe('New take from a locked take on show', () => {
  it('copies the set, then the walk (as held, the scene\'s cast kept), sets the take aside and opens the take: nothing recorded', async () => {
    showT1()
    expect(readOnlySet(W)?.takeId).toBe(T1.id)
    const order: string[] = []
    const savePlan = vi.fn(async (_id: string, p: ScenePlan) => { order.push('set'); expect(p).toBe(takeOnShow()!.plan); return {} as never })
    const savePerf = vi.fn(async (_id: string, _p: PerformancePlan) => { order.push('walk'); return {} as never })
    const deck = deckOf()
    expect(await startNewTake({ deck, worldId: W, scenePerf: SCENE_WALK, scenePlan: SCENE_SET, savePlan, savePerf })).toBe(true)
    expect(order).toEqual(['set', 'walk'])
    expect(savePlan).toHaveBeenCalledWith(W, T1_SET)
    expect(JSON.stringify(savePerf.mock.calls[0][1])).toBe(JSON.stringify({ ...T1_WALK, castId: 'ana' }))
    expect(currentTakeId()).toBeNull() // the open take is current, not T1
    expect(takeOnShow()).toBeNull() // the scene's setup is on show
    expect(readOnlySet(W)).toBeNull() // and editable
    expect(sceneWalkOn(W)).toBe(true) // no restore brings T1 back
    expect(openTakeOn(W)).toBe(true)
    expect(deck.take).toBeNull()
    expect(deck.recording).toBe(false)
  })

  it('copies nothing when the take on show already has the scene\'s walk and set', async () => {
    noteSceneSet(W, T1_SET)
    setCurrentTake(T1.id, true); setTakeOnShow(takeOnShowOf(T1))
    const savePlan = vi.fn(), savePerf = vi.fn()
    await startNewTake({ deck: deckOf(), worldId: W, scenePerf: T1_WALK, scenePlan: T1_SET, savePlan, savePerf })
    expect(savePlan).not.toHaveBeenCalled()
    expect(savePerf).not.toHaveBeenCalled()
    expect(currentTakeId()).toBeNull()
    expect(openTakeOn(W)).toBe(true)
  })

  it('a take with nothing of its own on show is still set aside: the open take is current', async () => {
    setCurrentTake('take-old', true)
    await startNewTake({ deck: deckOf(), worldId: W, scenePerf: SCENE_WALK, scenePlan: SCENE_SET, savePlan: vi.fn(), savePerf: vi.fn() })
    expect(currentTakeId()).toBeNull()
    expect(sceneWalkOn(W)).toBe(true)
  })

  it('a refused copy changes nothing: the take stays on show and current, the deck keeps its take', async () => {
    showT1()
    const deck = deckOf(), kept = deck.take
    const savePlan = vi.fn(async () => { throw new Error('the set would not be valid after this change') })
    await expect(startNewTake({ deck, worldId: W, scenePerf: SCENE_WALK, scenePlan: SCENE_SET, savePlan, savePerf: vi.fn() })).rejects.toThrow()
    expect(currentTakeId()).toBe(T1.id)
    expect(takeOnShow()?.takeId).toBe(T1.id)
    expect(deck.take).toBe(kept)
    expect(openTakeOn(W)).toBe(false)
  })

  it('does nothing while recording', async () => {
    showT1()
    const savePlan = vi.fn()
    expect(await startNewTake({ deck: { ...deckOf(), recording: true }, worldId: W, scenePerf: SCENE_WALK, scenePlan: SCENE_SET, savePlan, savePerf: vi.fn() })).toBe(false)
    expect(savePlan).not.toHaveBeenCalled()
    expect(currentTakeId()).toBe(T1.id)
  })
})

describe('the lock and the open take', () => {
  const take = fakeTake(0.5)
  const pack = { id: mocapPackId(T1_WALK), fps: 24, frames: 400 }
  const lockFetch = (sent: unknown[]) => vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/__lab/takes') return json({ takes: [] })
    const q = JSON.parse(init!.body as string) as TakeLockRequest
    sent.push(q)
    return json({ take: { ...q, id: `take-new-${sent.length}`, startKey: startKey(q.samples[0], q.focal, q.perfStart), lockedAt: 'x', createdAt: 'x' } }, 201)
  }) as unknown as typeof fetch

  it('a take leaving the deck never puts its lock back as the current take', async () => {
    const sent: unknown[] = []
    let t: typeof take | null = take
    const { result, rerender } = renderHook(() => useTakeLock(t, pack, W, 1.5, lockFetch(sent), undefined, null, T1_WALK))
    await act(async () => { await result.current.lock() })
    expect(currentTakeId()).toBe('take-new-1')
    act(() => { t = null; setCurrentTake(null) }) // New take: the deck is emptied and the open take is current
    rerender()
    expect(currentTakeId()).toBeNull()
    expect(result.current.locked).toBeNull()
  })

  it('Lock closes the open take: the new take sends the scene\'s set on the stage', async () => {
    setOpenTake(W, true)
    const sent: Record<string, unknown>[] = []
    const { result } = renderHook(() => useTakeLock(take, pack, W, 1.5, lockFetch(sent), undefined, T1_SET, T1_WALK))
    await act(async () => { await result.current.lock() })
    expect(openTakeOn(W)).toBe(false)
    expect(sent[0].setKey).toBe(setKeyOf(T1_SET))
    expect(JSON.stringify(sent[0].set)).toBe(JSON.stringify(T1_SET))
  })
})

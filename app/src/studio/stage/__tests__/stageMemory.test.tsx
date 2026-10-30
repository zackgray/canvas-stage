// @vitest-environment jsdom
// Owner 2026-10-28: going to Board or Render and back to the Stage dropped its state: the Camera view went back to Free view, the
// camera-move highlight to the first preset, the hold tick off, the picked person or piece (and so her panel) let go, and the
// "not locked" ask stayed up beside "Take locked". The Stage now keeps them for the scene for the page's life (stageMemory.ts,
// useSetPlace's per-world pick, the take lock's per-take record); each case below unmounts the screen and mounts it again.
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { Quaternion, Vector3 } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STAGE_RIGS } from '../../../labs/projection/operator/link'
import { StageOperatorEngine } from '../../../labs/projection/operator/stageEngine'
import type { KitWorld } from '../../../labs/projection/stage3d/kitApi'
import type { ProcessedTake } from '../../../labs/controller/take/processTake'
import type { TakeRecord } from '../../../shared/shotContract'
import { useSetPlace } from '../../scene/useSetPlace'
import { PresetMoves, TAKE_CUED } from '../../shoot/PresetMoves'
import { currentLock, useTakeLock } from '../../shoot/takeLock'
import { useRecordGuard } from '../../shoot/useRecordGuard'
import { arrivalPanes, resetStageMemo, setStageMemo } from '../stageMemory'

// a scene is open, as in the studio (the pick is remembered per scene; with none open there is nothing to come back to)
vi.mock('../../../library/currentScene', async (orig) => ({ ...(await orig<typeof import('../../../library/currentScene')>()), currentSceneId: () => 'sc-m' }))

afterEach(() => { cleanup(); resetStageMemo(); sessionStorage.clear(); localStorage.clear(); vi.unstubAllGlobals() })

const engineWithSubject = () => {
  const e = new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false, orbitTarget: () => new Vector3(0, 1.6, 0) })
  e.takeOver(new Vector3(0, 1.6, 6), new Quaternion(), 35)
  ;(e as unknown as { world: unknown }).world = { performance: { chestAt: () => new Vector3(1, 1.2, 0) }, clock: e.timeline, sources: () => [], trackHash: '' }
  return e
}

describe('the Stage keeps its state across a tab switch', () => {
  it('the view it was left on: Camera stays Camera on the way back (a first arrival still opens on the Free view)', () => {
    expect(arrivalPanes('sc-a', false)).toEqual(['free'])
    setStageMemo({ panes: ['camera'] }, 'sc-a')
    expect(arrivalPanes('sc-a', false)).toEqual(['camera'])
    expect(arrivalPanes('sc-b', false)).toEqual(['free']) // another scene's Stage keeps its own
  })

  it('the picked camera move and the hold tick come back as they were left', () => {
    const e = engineWithSubject()
    const ui = () => render(<PresetMoves engine={e} press={(a) => a()} secs={2} />)
    ui()
    fireEvent.click(screen.getByTestId('preset-crane'))
    fireEvent.click(screen.getByTestId('preset-hold-subject'))
    cleanup() // Board, and back
    ui()
    expect(screen.getByTestId('preset-crane').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('preset-push').getAttribute('aria-pressed')).toBe('false')
    expect((screen.getByTestId('preset-hold-subject') as HTMLInputElement).checked).toBe(true)
  })

  it('with a take and no move picked, Play replays the take: no move is lit, the panel says so; a pick lights it again', () => {
    const e = engineWithSubject()
    e.startPreset('pull', 2, true)
    for (let i = 0; i < 400 && e.move; i++) e.tick(1 / 60, 16 / 9)
    render(<PresetMoves engine={e} press={(a) => a()} secs={2} />)
    expect(screen.getByTestId('preset-cue-take').textContent).toBe(TAKE_CUED)
    expect(screen.getByTestId('preset-push').getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByTestId('preset-pan-left'))
    expect(screen.getByTestId('preset-pan-left').getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByTestId('preset-cue-take')).toBeNull()
  })

  it('the picked person (or piece) is picked again on the same world, and nothing is picked on another world', () => {
    const world = { id: 'loc-m', plan: { kit: [{ kind: 'tree', at: [1, 1] }] }, perf: { path: [] } } as unknown as KitWorld
    const a = renderHook(() => useSetPlace(world))
    act(() => a.result.current.select('mark'))
    a.unmount()
    expect(renderHook(() => useSetPlace(world)).result.current.pick).toBe('mark')
    const b = renderHook(() => useSetPlace(world))
    act(() => b.result.current.select(0))
    b.unmount()
    expect(renderHook(() => useSetPlace(world)).result.current.pick).toBe(0)
    expect(renderHook(() => useSetPlace({ ...world, id: 'loc-n' } as KitWorld)).result.current.pick).toBeNull()
  })

  it('a "not locked" ask is dropped once the take reads as locked (its lock found again), never left beside "Take locked"', () => {
    const deck = { recording: false, takeCount: 1 }
    const action = vi.fn()
    const g = renderHook(({ unlocked }) => useRecordGuard(deck, unlocked), { initialProps: { unlocked: true } })
    act(() => g.result.current.press(action))
    expect(g.result.current.asking).toBe(true)
    g.rerender({ unlocked: false })
    expect(g.result.current.asking).toBe(false)
    expect(action).not.toHaveBeenCalled() // dropped, never run unasked
  })

  it('the take in memory reads as locked at once on a remount, before the takes list is read again', async () => {
    const e = engineWithSubject()
    e.startPreset('pull', 2, true)
    for (let i = 0; i < 400 && e.move; i++) e.tick(1 / 60, 16 / 9)
    const take = e.deck.take as ProcessedTake
    const lk = currentLock(take, null, 'loc-m', 16 / 9)
    const key = lk && 'key' in lk ? lk.key : { startKey: '?', frames: 0 }
    const rec = { id: 'take-5', worldId: 'loc-m', packId: null, ...key } as unknown as TakeRecord
    const pending = (() => new Promise<Response>(() => {})) as unknown as typeof fetch // the list never answers in this test
    const lockAnswer = (async (_u: unknown, i?: RequestInit) => (i?.method === 'POST'
      ? new Response(JSON.stringify({ take: rec }), { headers: { 'content-type': 'application/json' } }) : new Promise<Response>(() => {}))) as typeof fetch
    const first = renderHook(() => useTakeLock(take, null, 'loc-m', 16 / 9, lockAnswer))
    await act(async () => { await first.result.current.lock() })
    expect(first.result.current.locked?.id).toBe('take-5')
    first.unmount()
    const again = renderHook(() => useTakeLock(take, null, 'loc-m', 16 / 9, pending))
    expect(again.result.current.locked?.id).toBe('take-5')
    expect(again.result.current.changed).toBe(false)
  })
})

// @vitest-environment jsdom
// The take-list pick path (review F5, item 9): a row picked on Render's shots list is the one take Render, Export and the Stage's
// render overlay read; it survives a tab switch, a reload and a scene switch (remembered per world), and the Stage's restore after
// a reload comes back on it too. A Stage lock still moves it; a remembered take that is gone falls back and says which is shown.
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { L2RRender, TakeRecord } from '../../shared/shotContract'
import { resetSceneJobs } from '../../jobs/sceneJobs'
import { currentTakeId, resetCurrentTake, setCurrentTake } from '../shoot/currentTake'
import { resetLockedTakes, useRestoreTake } from '../shoot/worldTakes'
import { TakeShot, useTakeShot } from '../screens/TakeShot'
import { pick, resetL2RStore, scopeWorld, useL2RState } from './l2rStore'

const rec = (id: string, lockedAt: string, worldId = 'loc-a'): TakeRecord => ({ id, worldId, packId: null, fps: 24, frames: 97, samples: [], focal: 35, viewAspect: 1.77,
  perfStart: 0, startKey: 'k', lockedAt, createdAt: lockedAt })
const OLD = rec('take-2026-10-27T05-00-00-001', '2026-10-27T05:00:00.001Z')
const NEW = rec('take-2026-10-28T05-00-00-001', '2026-10-28T05:00:00.001Z')
const OTHER = rec('take-2026-10-28T06-00-00-001', '2026-10-28T06:00:00.001Z', 'loc-b')
const done = (t: TakeRecord): L2RRender => ({ id: `l2r-${t.id.slice(5)}`, takeId: t.id, stillId: 's', clay: '/c.mp4', raw: `/${t.id}-raw.mp4`, finished: `/${t.id}-fin.mp4`, jobId: 'j', credits: 20, status: 'done', createdAt: 'x' })
const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })
let disk: TakeRecord[]

beforeEach(() => {
  localStorage.clear(); resetL2RStore(); resetCurrentTake(); resetLockedTakes()
  disk = [NEW, OLD, OTHER]
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/__lab/takes') return ok({ takes: disk })
    if (url.startsWith('/__lab/l2r?take=')) {
      const t = disk.find((d) => url.endsWith(encodeURIComponent(d.id)))
      return ok({ renders: t ? [done(t)] : [], take: t ?? null, missing: [] })
    }
    return ok({ shots: [] })
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); resetL2RStore(); resetCurrentTake(); resetLockedTakes(); resetSceneJobs() })

/** what Export shows: the picked take's shot, named */
function Export({ world }: { world: string }) { return <TakeShot shot={useTakeShot(world)} /> }
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })

describe('the take picked on Render', () => {
  it('is the take Export names and offers, and it stays after a reload (the store gone, the browser keeps the pick)', async () => {
    setCurrentTake(NEW.id) // the Stage locked the newest
    const page = render(<Export world="loc-a" />)
    await waitFor(() => expect(screen.getByTestId('export-take-name').textContent).toMatch(/^Take · 28 Oct 05:00/))
    await act(async () => { pick(OLD.id) }) // the owner picks the older take on Render's list
    await waitFor(() => expect(screen.getByTestId('export-take-name').textContent).toMatch(/^Take · 27 Oct 05:00 · 4\.0 s/))
    expect(screen.getByTestId('export-take-download').getAttribute('href')).toBe(`/${OLD.id}-fin.mp4`)
    page.unmount()
    // a reload: the in-memory stores start empty, the Stage has not restored anything yet
    resetL2RStore(); resetCurrentTake()
    render(<Export world="loc-a" />)
    await waitFor(() => expect(screen.getByTestId('export-take-download').getAttribute('href')).toBe(`/${OLD.id}-fin.mp4`))
    expect(screen.queryByTestId('export-pick-note')).toBeNull()
  })

  it("after a reload the Stage's restore comes back on the picked take, not the newest, so the store and the Stage agree", async () => {
    localStorage.setItem('canvas-stage.render-take.loc-a', OLD.id)
    const takes = [NEW, OLD]
    renderHook(() => useRestoreTake(null, null, takes))
    await waitFor(() => expect(currentTakeId()).toBe(OLD.id))
    const { result } = renderHook(() => useL2RState('loc-a'))
    await waitFor(() => expect(result.current.takeId).toBe(OLD.id))
  })

  it('a take locked on the Stage after the pick moves it (and is remembered)', async () => {
    setCurrentTake(OLD.id)
    const { result } = renderHook(() => useL2RState('loc-a'))
    await waitFor(() => expect(result.current.takeId).toBe(OLD.id))
    const LATEST = rec('take-2026-10-28T07-00-00-001', '2026-10-28T07:00:00.001Z')
    disk = [LATEST, ...disk]
    await act(async () => { setCurrentTake(LATEST.id) })
    await waitFor(() => expect(result.current.takeId).toBe(LATEST.id))
    expect(localStorage.getItem('canvas-stage.render-take.loc-a')).toBe(LATEST.id)
  })

  it('a scene switch and back comes back on each world’s own pick', async () => {
    const { result } = renderHook(() => useL2RState('loc-a'))
    await settle()
    await act(async () => { pick(OLD.id) })
    await act(async () => { scopeWorld('loc-b') })
    await waitFor(() => expect(result.current.takeId).toBe(OTHER.id))
    await act(async () => { scopeWorld('loc-a') })
    await waitFor(() => expect(result.current.takeId).toBe(OLD.id))
  })

  it('a remembered take that is gone falls back to the default and says which take is shown', async () => {
    localStorage.setItem('canvas-stage.render-take.loc-a', 'take-2026-10-20T05-00-00-001')
    render(<Export world="loc-a" />)
    await waitFor(() => expect(screen.getByTestId('export-pick-note').textContent).toBe('The take picked before (Take · 20 Oct 05:00) is gone: showing Take · 28 Oct 05:00.'))
    expect(screen.getByTestId('export-take-download').getAttribute('href')).toBe(`/${NEW.id}-fin.mp4`)
  })
})

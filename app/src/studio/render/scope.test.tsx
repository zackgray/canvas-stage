// @vitest-environment jsdom
// QA 2026-10-25: a brand-new scene's Render and Export showed an old ski chase (the newest render on disk). Render and Export
// are scoped to the world on the set; the Render price follows the keyframe ticks.
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CutController } from '../../labs/projection/cut'
import type { L2RListResponse, L2RRender, TakeRecord } from '../../shared/shotContract'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { EMPTY, ExportScreen } from '../screens/ExportScreen'
import { emptyLine, viewUrl } from '../screens/RenderViewer'
import { useExportCut } from '../screens/useExportCut'
import { L2RBlock } from './L2RBlock'
import type { L2RStatusExtra } from './l2rExtra'
import { priceOf, useL2R } from './l2rModel'
import { finish, resetL2RStore, scopeWorld, setKeyframe, setPrompt, setSeed, useL2RSnapshot, useL2RState, type L2RState } from './l2rStore'

const mk = (id: string, worldId: string): TakeRecord => ({ id, worldId, packId: null, fps: 24, frames: 193, samples: [], focal: 35, viewAspect: 1.77, perfStart: 0, startKey: 'k',
  lockedAt: `2026-10-2${id.slice(-1)}T10:00:00.000Z`, createdAt: 't' })
const OLD = mk('take-2026-10-19T00-00-00-001', 'loc-ski')
const NEW = mk('take-2026-10-24T05-49-49-802', 'loc-new')
const done: L2RRender = { id: 'l2r-1', takeId: OLD.id, stillId: 's', clay: '/c.mp4', raw: '/ski-raw.mp4', finished: '/ski.mp4', jobId: 'j', credits: 50, status: 'done' }
let asked: string[]
const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  resetL2RStore(); asked = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    asked.push(url)
    if (url === '/__lab/takes') return ok({ takes: [OLD] }) // only the ski chase is locked on disk
    if (url.startsWith('/__lab/clay?')) return ok({ clay: { status: 'done', startKey: 'k' } })
    if (url.startsWith('/__lab/l2r?take=')) return ok({ renders: [done], take: OLD, missing: [] })
    return ok({}, 404)
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetL2RStore() })

describe('Render is scoped to the world on the set', () => {
  it("a new scene never lists another world's take or asks for its renders", async () => {
    const { result } = renderHook(() => useL2R('loc-new'))
    await waitFor(() => expect(asked).toContain('/__lab/takes'))
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    expect(result.current.state.takes).toEqual([])
    expect(result.current.current).toBeNull()
    expect(asked.some((u) => u.startsWith('/__lab/l2r?take='))).toBe(false)
    render(<L2RBlock lab={{} as ProjectionLabState} />)
    expect(screen.getByTestId('l2r-no-takes').textContent).toMatch(/No locked take for this scene yet/)
  })

  it("the world's own take is listed and its render is on show", async () => {
    const { result } = renderHook(() => useL2R('loc-ski'))
    await waitFor(() => expect(result.current.current?.id).toBe('l2r-1'))
    expect(result.current.state.takes.map((t) => t.id)).toEqual([OLD.id])
  })

  it("the viewer shows only this take's render, finished over raw, and the empty player says what to do", () => {
    expect(viewUrl({ current: null })).toBeNull()
    expect(emptyLine({ facts: { take: false } } as never)).toMatch(/Nothing rendered for this scene yet.*film a take and lock it/)
    expect(viewUrl({ current: done })).toBe('/ski.mp4')
    expect(viewUrl({ current: { ...done, finished: null } })).toBe('/ski-raw.mp4')
    expect(viewUrl({ current: { ...done, status: 'failed' } })).toBeNull()
  })

  it('Export lists only the performance on the set (none on the set: nothing)', () => {
    const take = (warp: string) => ({ id: `${warp}/final-1`, warpFolder: warp, kind: 'final', stamp: '1', frames: 97, sourceStart: 0, width: 1920, height: 1088, hasAudio: false, url: '/x.mp4' })
    const cut = { data: { performances: [{ packId: 'pack-ski', takes: [take('warp-ski')] }], cuts: [], ffmpeg: true }, running: false, status: null, exportCut: vi.fn() } as unknown as CutController
    expect(renderHook(() => useExportCut(cut, 'pack-new')).result.current.pack).toBeUndefined()
    expect(renderHook(() => useExportCut(cut, null)).result.current.performances).toEqual([])
    expect(renderHook(() => useExportCut(cut, 'pack-ski')).result.current.pack?.packId).toBe('pack-ski')
  })
})

describe('Export for a new scene', () => {
  it("lists none of another scene's exports (even one with no pack id) and says what to do", async () => {
    const cut = { loaded: true, data: { performances: [], cuts: [{ id: 'cut-1', url: '/ski-cut.mp4', segments: 3 }], ffmpeg: true }, running: false, status: { state: 'done', id: 'cut-2', packId: 'pack-ski', output: '/ski-cut2.mp4' }, error: null, exportCut: vi.fn() } as unknown as CutController
    const lab = { s: { source: 'loc-new' }, performance: { layer: null } } as unknown as ProjectionLabState
    render(<ExportScreen cut={cut} lab={lab} />)
    expect(screen.getByTestId('cut-empty').textContent).toBe(EMPTY)
    expect(screen.queryByTestId('cut-out')).toBeNull() // none of them: no Exported list at all, not "Exported 0" (review F6)
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    expect(screen.queryByTestId('export-take-shot')).toBeNull()
  })
})

describe('the Render price follows the keyframe ticks', () => {
  const est = (credits: number) => ({ credits, perFrame: 0, frames: 193, basis: '' })
  const key = (n: 'mid' | 'end') => ({ still: { id: `k-${n}` }, role: n, frame: 96, strength: 1, stale: null })
  const st = (keyOff: { mid: boolean; end: boolean }, o: Partial<L2RListResponse & L2RStatusExtra> = {}) =>
    ({ keyOff, status: { renders: [], estimate: est(65), estimateKeyed: est(72), keyframes: { mid: key('mid'), end: key('end') }, ...o } }) as unknown as L2RState

  it('a guide sent = the keyed price; both unticked = the plain price; no keyframes = the plain price', () => {
    expect(priceOf(st({ mid: false, end: false }))).toBe(72)
    expect(priceOf(st({ mid: true, end: false }))).toBe(72)
    expect(priceOf(st({ mid: true, end: true }))).toBe(65)
    expect(priceOf(st({ mid: false, end: false }, { keyframes: { mid: null, end: null } }))).toBe(65)
  })

  it('an older server with no keyed price: no price, so the press stays off rather than under-read', () => {
    expect(priceOf(st({ mid: false, end: false }, { estimateKeyed: undefined }))).toBeNull()
  })

  it("the store's ticks move the hook's price", async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/__lab/takes') return ok({ takes: [NEW] })
      if (url.startsWith('/__lab/clay?')) return ok({ clay: { status: 'done', startKey: 'k' } })
      if (url.startsWith('/__lab/l2r?take=')) return ok({ renders: [], take: NEW, missing: [], estimate: est(65), estimateKeyed: est(72), keyframes: { mid: key('mid'), end: key('end') } })
      return ok({}, 404)
    }))
    const { result } = renderHook(() => useL2R('loc-new'))
    await waitFor(() => expect(result.current.price).toBe(65)) // keyframes are off until ticked on
    act(() => { setKeyframe('mid', true); setKeyframe('end', true) })
    expect(result.current.price).toBe(72)
    act(() => { setKeyframe('mid', false); setKeyframe('end', false) })
    expect(result.current.price).toBe(65)
  })
})

describe('a render call out for one world never shows on another (Home, then another scene)', () => {
  it('its busy flag and its error stay with the world it was pressed on', async () => {
    let answer!: (r: Response) => void
    vi.stubGlobal('fetch', vi.fn((url: string) => (url === '/__lab/l2r/finish' ? new Promise<Response>((r) => { answer = r }) : Promise.resolve(ok({ takes: [] })))))
    const { result } = renderHook(() => useL2RSnapshot())
    act(() => scopeWorld('loc-ski'))
    let out!: Promise<unknown>
    act(() => { out = finish('l2r-1') })
    expect(result.current.working).toBe(true)
    act(() => scopeWorld('loc-new')) // another scene's Render
    expect(result.current.working).toBe(false)
    await act(async () => { answer(ok({ error: 'the finish failed' }, 502)); await out })
    expect(result.current.error).toBeNull()
    expect(result.current.working).toBe(false)
  })
})

describe("what the owner typed for one scene's render never rides on another's (paid) render", () => {
  it('the prompt override, seed and keyframe ticks start fresh on another world, whether Render stays open or opens again', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ takes: [] })))
    const one = renderHook(({ w }) => useL2RState(w), { initialProps: { w: 'loc-ski' } })
    act(() => { setPrompt('a fox in the snow'); setSeed(7); setKeyframe('mid', true) })
    one.rerender({ w: 'loc-new' }) // the set changes under an open Render
    expect(one.result.current).toMatchObject({ prompt: '', seed: 42, keyOff: { mid: true, end: true }, dirty: false })
    act(() => { setPrompt('a ski chase') })
    one.unmount()
    const two = renderHook(() => useL2RState('loc-ski')) // another scene's Render mounts afresh
    expect(two.result.current.prompt).toBe('')
  })
})

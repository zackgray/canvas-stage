// @vitest-environment jsdom
// Tidy wave (STALE), owner 10-29: a piece built or moved after the lock (same camera, same motion) is the same take: it stays locked
// and current (a hand-flown move cannot be recorded again), and its frames behind the set say the draw prepares them again. And Shoot's hero
// list stales a still drawn for another cast card exactly as Render does (startKey.ts castStale).
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OperatorEngine } from '../../labs/controller/engine/engine'
import { fakeTake } from '../../labs/projection/clay/__fixtures__/take'
import { STAGE_RIGS } from '../../labs/projection/operator/link'
import { KIT_CHANGED } from '../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { startKey, type TakeLockRequest, type TakeRecord } from '../../shared/shotContract'
import { STALE_START, staleWhy } from '../../shared/startKey'
import { currentTakeId, resetCurrentTake, setCurrentTake } from './currentTake'
import { HeroStrip } from './HeroStrip'
import { resetClayStore, SET_BEHIND } from './takeClay'
import { TakeLockBlock } from './TakeLockBlock'
import { useHeroStill } from './useHeroStill'

const SET = { kit: [{ kind: 'crate', at: [1, -4] }] }
const MOVED = { kit: [{ kind: 'crate', at: [2, -4] }] }

let disk: TakeRecord[] = []
let sent: (TakeLockRequest & { setKey?: string })[] = []
let castNow: string | null = 'ana'
let clayMoved: string | null = null
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status })
beforeEach(() => {
  disk = []; sent = []; castNow = 'ana'; clayMoved = null
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/__lab/takes') return json({ takes: disk })
    if (url === '/__lab/takes/lock') {
      const q = JSON.parse(init!.body as string) as TakeLockRequest & { setKey?: string }
      sent.push(q)
      const take = { ...q, id: `take-${disk.length + 1}`, startKey: startKey(q.samples[0], q.focal, q.perfStart), lockedAt: 'x', createdAt: 'x' } as TakeRecord
      disk.unshift(take)
      return json({ take }, 201)
    }
    if (url.startsWith('/__lab/stage3d/world?id=')) return json({ id: 'loc-k', perf: { path: [], ...(castNow ? { castId: castNow } : {}) } })
    if (url.startsWith('/__lab/hero?take=')) {
      const k = disk[0]?.startKey
      return json({ stills: [{ id: 'h-ana', takeId: disk[0]?.id, startKey: k, castId: 'ana' }, { id: 'h-old', takeId: disk[0]?.id, startKey: k }], opening: { present: true, startKey: k } })
    }
    if (url.startsWith('/__lab/l2r')) return json({ renders: [], done: [] })
    if (url.startsWith('/__lab/clay?take=')) return json({ clay: disk[0] ? { takeId: disk[0].id, startKey: disk[0].startKey, status: 'done', frames: 4, depth: {}, ...(clayMoved ? { setMoved: clayMoved } : {}) } : null })
    return json({}, 404)
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetClayStore(); resetCurrentTake() })

describe('a set change after lock', () => {
  function mount() {
    const engine = new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false })
    const lab = { op: { mode: 'operator', setMode: vi.fn(), note: null, engine }, stage: { view: { aspect: 16 / 9 }, kit: { plan: SET } }, s: { source: 'loc-a' },
      performance: { layer: null, listed: true, packs: [], selected: null } } as unknown as ProjectionLabState
    engine.deck.take = fakeTake(4)
    render(<TakeLockBlock lab={lab} />)
    return lab
  }
  const setPlan = (lab: ProjectionLabState, plan: unknown) => act(() => { (lab.stage as unknown as { kit: { plan: unknown } }).kit = { plan } })
  async function lockNow() {
    act(() => { screen.getByTestId('take-lock-btn').click() })
    await waitFor(() => expect(screen.getByTestId('take-locked').textContent).toBe('Take locked.'))
  }

  it('is still the same locked take: no re-lock press, the current take stays, and the frames behind the set say the draw updates them', async () => {
    const lab = mount()
    await lockNow()
    expect(sent[0].setKey).toMatch(/^[0-9a-f]{8}$/)
    expect(currentTakeId()).toBe('take-1')
    clayMoved = '2026-10-29T21:00:00.000Z'
    setPlan(lab, MOVED)
    act(() => { window.dispatchEvent(new CustomEvent(KIT_CHANGED, { detail: { id: 'loc-a' } })) })
    await waitFor(() => expect(screen.getByTestId('take-set-behind').textContent).toBe(SET_BEHIND), { timeout: 2000 })
    expect(screen.getByTestId('take-locked')).toBeTruthy()
    expect(screen.queryByTestId('take-lock-btn')).toBeNull()
    expect(screen.queryByTestId('take-changed')).toBeNull()
    expect(currentTakeId()).toBe('take-1')
    expect(sent).toHaveLength(1)
  })
})

describe("Shoot's hero list and the cast", () => {
  const take = (): TakeRecord => ({ id: 'take-1', worldId: 'locations/loc-k', packId: null, fps: 24, frames: 9, samples: [{ t: 0, position: [0, 1.6, 0], quaternion: [0, 0, 0, 1], focal: 50, focus: 3 }],
    focal: 50, viewAspect: 16 / 9, perfStart: 0, startKey: startKey({ position: [0, 1.6, 0], quaternion: [0, 0, 0, 1] }, 50, 0), lockedAt: 'x', createdAt: 'x' })
  const staleOf = (r: { current: ReturnType<typeof useHeroStill> }) => Object.fromEntries(r.current.stills.map((s) => [s.id, s.stale]))

  it('a still drawn for the card the world names is current; after Played by changes, it is stale (an unrecorded cast never is)', async () => {
    disk = [take()]
    setCurrentTake('take-1')
    const { result } = renderHook(() => useHeroStill(async () => new Blob()))
    await waitFor(() => expect(staleOf(result)).toEqual({ 'h-ana': false, 'h-old': false }))
    castNow = 'bob'
    act(() => { window.dispatchEvent(new CustomEvent(KIT_CHANGED, { detail: { id: 'loc-k' } })) })
    await waitFor(() => expect(staleOf(result)).toEqual({ 'h-ana': true, 'h-old': false }))
    // the strip's stale badge names the cast as the reason on hover, not the start camera
    const ana = result.current.stills.find((s) => s.id === 'h-ana')!
    expect(ana.staleWhy).toMatch(/^Played by changed/)
    render(<HeroStrip stills={result.current.stills} onApprove={() => {}} />)
    expect(screen.getByTestId('hero-stale-h-ana').getAttribute('title')).toBe(ana.staleWhy)
  })
  it('a still of another start names the start camera or performance frame', () => {
    expect(staleWhy({ takeId: 'take-1', startKey: 'other' }, take(), 'ana')).toBe(STALE_START)
    expect(staleWhy({ takeId: 'take-1', startKey: take().startKey, castId: 'ana' }, take(), 'ana')).toBeNull()
  })
})

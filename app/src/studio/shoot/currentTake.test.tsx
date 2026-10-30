// @vitest-environment jsdom
// Which take is current (Wave B join): the hero block follows the take Shoot's lock block just locked, not the newest on
// disk; Render opens on Shoot's take, else the most recently locked take.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OperatorEngine } from '../../labs/controller/engine/engine'
import { fakeTake } from '../../labs/projection/clay/__fixtures__/take'
import { STAGE_RIGS } from '../../labs/projection/operator/link'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { startKey, type ClayExport, type TakeLockRequest, type TakeRecord } from '../../shared/shotContract'
import { defaultTake } from '../render/l2rPick'
import { loadTakes, resetL2RStore, pick, useL2RState } from '../render/l2rStore'
import { currentTakeId, resetCurrentTake, setCurrentTake } from './currentTake'
import { HeroStillBlock } from './HeroStillBlock'
import { TakeLockBlock } from './TakeLockBlock'

const rec = (id: string, lockedAt: string, key = 'k'): TakeRecord => ({ id, worldId: 'loc-a', packId: 'pack-a', fps: 24, frames: 97, samples: [], focal: 35,
  viewAspect: 16 / 9, perfStart: 0, startKey: key, lockedAt, createdAt: lockedAt })
const clay = (t: TakeRecord, over: Partial<ClayExport> = {}): ClayExport => ({ takeId: t.id, startKey: t.startKey, mp4: 'x.mp4', frames: 97, width: 1920, height: 1088, status: 'done', ...over })
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })

let disk: TakeRecord[] = []
let clays: Record<string, ClayExport> = {}
let calls: string[] = []
beforeEach(() => {
  resetCurrentTake(); resetL2RStore()
  disk = []; clays = {}; calls = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(String(url))
    if (url === '/__lab/takes') return json({ takes: disk })
    if (url === '/__lab/takes/lock') {
      const q = JSON.parse(init!.body as string) as TakeLockRequest
      const take = { ...q, id: `take-${disk.length + 1}`, startKey: startKey(q.samples[0], q.focal, q.perfStart), lockedAt: '2026-10-22T10:00:00.000Z', createdAt: 'x' } as TakeRecord
      disk.push(take)
      return json({ take }, 201)
    }
    if (url.startsWith('/__lab/clay?')) { const c = clays[new URL(url, 'http://x').searchParams.get('take')!]; return c ? json({ clay: c }) : json({ error: 'no clay' }, 404) }
    if (url.startsWith('/__lab/hero?')) return json({ stills: [], opening: { present: false, startKey: null }, running: null, unrecovered: [] })
    if (url.startsWith('/__lab/l2r?')) return json({ renders: [], missing: [] })
    return json({}, 404)
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetL2RStore() })

describe('the hero block follows the take the lock block locked', () => {
  it('not the newest take on disk; and switches at once when another take is locked', async () => {
    disk = [rec('take-newer', '2026-10-22T23:00:00.000Z')] // locked later (another move), newest on disk
    const engine = new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false })
    engine.deck.take = fakeTake(4)
    const lab = { op: { mode: 'operator', setMode: vi.fn(), note: null, engine }, stage: null, s: { source: 'loc-a' },
      performance: { layer: { pack: { id: 'pack-a', fps: 24, frames: 400 } }, listed: true, packs: [], selected: 'pack-a' } } as unknown as ProjectionLabState
    render(<><TakeLockBlock lab={lab} /><HeroStillBlock lab={lab} capture={async () => new Blob(['x'])} /></>)
    // before any lock the hero block says to lock one: no fallback to the newest take on disk (B3)
    expect((await screen.findByTestId('hero-no-take')).textContent).toMatch(/Lock a take first/)
    act(() => { screen.getByTestId('take-lock-btn').click() })
    await waitFor(() => expect(screen.getByTestId('take-locked')).toBeTruthy())
    await waitFor(() => expect(currentTakeId()).toBe('take-2')) // the store follows in the lock's own effect, after the text
    await waitFor(() => expect(calls).toContain('/__lab/hero?take=take-2'))
    expect(calls.filter((c) => c.startsWith('/__lab/hero?')).at(-1)).toBe('/__lab/hero?take=take-2')
    expect(calls).not.toContain('/__lab/hero?take=take-newer')
  })
})

describe('Render opens on the right take', () => {
  const a = rec('take-a', '2026-10-22T10:00:00.000Z'), b = rec('take-b', '2026-10-22T11:00:00.000Z'), c = rec('take-c', '2026-10-22T12:00:00.000Z')
  const newestFirst = [c, b, a]
  it('Shoot\'s take, else the most recently LOCKED take: clay never decides (QA: the new 49 f take lost to an older 193 f one that had its frames)', () => {
    expect(defaultTake(newestFirst, 'take-a')).toBe('take-a')
    expect(defaultTake(newestFirst, 'take-c')).toBe('take-c')
    expect(defaultTake(newestFirst, null)).toBe('take-c')
    expect(defaultTake([a, c, b], null)).toBe('take-c') // by lock time, not by list order
    expect(defaultTake(newestFirst, 'take-gone')).toBe('take-c')
    expect(defaultTake([], null)).toBeNull()
  })

  it('opens on the just-locked short take though an older long take already has its clay', async () => {
    disk = [{ ...c, frames: 49 }, { ...a, frames: 193 }]; clays = { 'take-a': clay(a) } // c has no frames yet
    let seen: string | null = null
    function Probe() { seen = useL2RState().takeId; return null }
    render(<Probe />)
    await waitFor(() => expect(seen).toBe('take-c'))
  })

  it('keeps the owner\'s pick until Shoot locks another take', async () => {
    disk = [c, b, a]; clays = { 'take-a': clay(a), 'take-b': clay(b) }
    let seen: string | null = null
    function Probe() { seen = useL2RState().takeId; return null }
    render(<Probe />)
    await waitFor(() => expect(seen).toBe('take-c'))
    act(() => pick('take-b'))
    await act(async () => { await loadTakes() })
    expect(seen).toBe('take-b')
    setCurrentTake('take-a')
    await act(async () => { await loadTakes() })
    expect(seen).toBe('take-a')
  })
})

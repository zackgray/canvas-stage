// @vitest-environment jsdom
// Render's one take pick and the Stage's take on show are the same take (l2rStore.pick, worldTakes.useRestoreTake): picking an
// older locked take on Render's shots list and coming back to the Stage finds its Render clip press (the first-frame window's) on that take, as a reload does, not
// "Lock a take first" while a take is locked. The takes and l2r routes are faked; nothing is sent or spent.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OperatorEngine } from '../../../labs/controller/engine/engine'
import { STAGE_RIGS } from '../../../labs/projection/operator/link'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import type { L2RListResponse, TakeRecord } from '../../../shared/shotContract'
import { resetSceneJobs } from '../../../jobs/sceneJobs'
import { resetL2RStore, pick } from '../../render/l2rStore'
import type { L2RStatusExtra } from '../../render/l2rExtra'
import { KIT_NEEDS_TAKE } from '../../screens/primaryAction'
import { publishHero } from '../../shoot/heroPublished'
import { currentTakeId, resetCurrentTake, setCurrentTake } from '../../shoot/currentTake'
import { resetClayStore } from '../../shoot/takeClay'
import { readTakePick } from '../../shoot/takePick'
import { RenderClip } from '../RenderClip'
import { useStageRender } from '../useStageRender'
import { setPieceBuildApi } from '../pieceBuilding'

const W = 'loc-1'
const rec = (id: string, at: string): TakeRecord => ({ id, worldId: W, packId: null, fps: 24, frames: 97, samples: [], focal: 35, viewAspect: 1.77, perfStart: 0, startKey: 'k', lockedAt: at, createdAt: at })
const newer = rec('take-2026-10-28T03-46-11-968', '2026-10-28T03:46:11.968Z')
const older = rec('take-2026-10-28T03-24-28-007', '2026-10-28T03:24:28.007Z')
const ready = (take: TakeRecord): L2RListResponse & L2RStatusExtra => ({ renders: [], take,
  clay: { takeId: take.id, startKey: 'k', mp4: '/clay.mp4', frames: 97, width: 1920, height: 1088, status: 'done' },
  still: { id: `still-${take.id}`, takeId: take.id, startKey: 'k', png: '/s.png', seed: 1, jobId: null, credits: 1, approved: true, createdAt: 't' }, missing: [], prompt: 'A figure.', configured: true,
  estimate: { credits: 21, perFrame: 0.21, frames: 97, basis: 'about 0.21 cr per frame' }, running: null, finishing: [] })
const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
const lab = () => ({
  op: { mode: 'orbit', setMode: vi.fn(), note: null, engine: new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false }) },
  stage: null, kit: { id: W, world: null },
  s: { source: W, look: 'textured' }, set: vi.fn(), shot: undefined, shots: [], pickSource: vi.fn(),
  performance: { listed: true, packs: [], selected: null, select: vi.fn(), phase: null, error: null, layer: null, plateAvailable: false, plateOn: true, setPlateOn: vi.fn() },
}) as unknown as ProjectionLabState
/** the first-frame window's Render clip press, read as the Stage reads it */
const Clip = ({ lab }: { lab: ProjectionLabState }) => <RenderClip r={useStageRender(lab)} />

beforeEach(() => {
  setCurrentTake(newer.id); setPieceBuildApi({ get: vi.fn(async () => ({ price: 8, tiles: [], running: null, setChangedAt: null, stillStale: false })), build: vi.fn(), recover: vi.fn(), complete: vi.fn() })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/__lab/takes') return ok({ takes: [older, newer] })
    if (String(url).startsWith('/__lab/l2r?take=')) return ok(ready(String(url).includes(older.id) ? older : newer))
    return ok({ error: 'no' }, 404)
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); publishHero(null); setPieceBuildApi(null); resetCurrentTake(); resetClayStore(); resetSceneJobs(); resetL2RStore(); localStorage.clear() })

describe("Render's take pick and the Stage's take on show", () => {
  it('an older locked take picked on Render: the Stage shows it and its Render press is live, not "Lock a take first"', async () => {
    render(<Clip lab={lab()} />)
    const rnd = await screen.findByTestId('render-primary') as HTMLButtonElement
    await waitFor(() => expect(rnd.textContent).toMatch(/Render/))
    await waitFor(() => expect(rnd.disabled).toBe(false))
    await act(async () => { pick(older.id) })
    await new Promise((r) => setTimeout(r, 300)) // the takes re-read after the pick settles on the same take
    const after = screen.getByTestId('render-primary') as HTMLButtonElement
    expect(after.title).not.toBe(KIT_NEEDS_TAKE)
    expect(after.disabled).toBe(false)
    expect(currentTakeId()).toBe(older.id)
    expect(readTakePick(W)).toBe(older.id)
  })
})

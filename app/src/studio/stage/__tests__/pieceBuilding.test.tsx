// @vitest-environment jsdom
// While a 3D piece builds the server refuses Draw and Render for about a minute: the steps line under the panel says so, and the
// presses hold wherever they live now (owner 10-29): the take card's Draw the first frame and the first-frame window's Render clip
// (pieceBuilding.ts). The pieces route is faked (setPieceBuildApi); the takes and l2r routes are faked as the draw bar's tests
// fake them; nothing is ever sent anywhere and no press spends.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OperatorEngine } from '../../../labs/controller/engine/engine'
import { STAGE_RIGS } from '../../../labs/projection/operator/link'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import type { L2RListResponse, TakeRecord } from '../../../shared/shotContract'
import { resetSceneJobs } from '../../../jobs/sceneJobs'
import type { PiecesApi, PiecesResponse } from '../../scene/piecesApi'
import { resetL2RStore } from '../../render/l2rStore'
import type { L2RStatusExtra } from '../../render/l2rExtra'
import { publishHero, type HeroPressModel } from '../../shoot/heroPublished'
import { resetCurrentTake, setCurrentTake } from '../../shoot/currentTake'
import { resetClayStore } from '../../shoot/takeClay'
import { ShotSteps } from '../panels/ShotSteps'
import { RenderClip } from '../RenderClip'
import { TakeCard } from '../TakeCard'
import { useStageRender } from '../useStageRender'
import { holdForBuild, PIECE_BUILDING, setPieceBuildApi } from '../pieceBuilding'
import type { Primary } from '../../screens/primaryAction'

const TAKE = 'take-2026-10-22T19-00-00-000'
const takeRec: TakeRecord = { id: TAKE, worldId: 'loc-1', packId: null, fps: 24, frames: 97, samples: [], focal: 35, viewAspect: 1.77, perfStart: 0, startKey: 'k', lockedAt: '2026-10-22T19:00:00.000Z', createdAt: '2026-10-22T19:00:00.000Z' }
const ready: L2RListResponse & L2RStatusExtra = { renders: [], take: takeRec, clay: { takeId: TAKE, startKey: 'k', mp4: '/clay.mp4', frames: 97, width: 1920, height: 1088, status: 'done' },
  still: { id: 'still-1', takeId: TAKE, startKey: 'k', png: '/s.png', seed: 1, jobId: null, credits: 1, approved: true, createdAt: 't' }, missing: [], prompt: 'A figure.', configured: true,
  estimate: { credits: 21, perFrame: 0.21, frames: 97, basis: 'about 0.21 cr per frame' }, running: null, finishing: [] }
const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })

let posts: string[]
let running: PiecesResponse['running']
const pieces: PiecesApi = {
  get: vi.fn(async () => ({ price: 12, tiles: [], running, setChangedAt: null, stillStale: false })),
  build: vi.fn(), recover: vi.fn(), complete: vi.fn(),
}
const lab = () => ({
  op: { mode: 'orbit', setMode: vi.fn(), note: null, engine: new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false }) },
  stage: null, kit: { id: 'loc-1', world: null },
  s: { source: 'loc-1', look: 'textured' }, set: vi.fn(), shot: undefined, shots: [], pickSource: vi.fn(),
  performance: { listed: true, packs: [], selected: null, select: vi.fn(), phase: null, error: null, layer: null, plateAvailable: false, plateOn: true, setPlateOn: vi.fn() },
}) as unknown as ProjectionLabState
/** the Stage's pieces that read the build: the steps line, the take card (Draw the first frame) and Render clip */
function Stage({ lab }: { lab: ProjectionLabState }) {
  const r = useStageRender(lab)
  return <><ShotSteps lab={lab} /><TakeCard lab={lab} takeId={TAKE} /><RenderClip r={r} /></>
}
const press = (o: Partial<HeroPressModel> = {}): HeroPressModel => ({ price: 39, drawing: false, phase: null, since: null, gate: null, title: 'Draws the first frame', disabled: false, onPress: vi.fn(), ...o })

beforeEach(() => {
  posts = []; running = null; setCurrentTake(TAKE); setPieceBuildApi(pieces)
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/__lab/takes') return ok({ takes: [takeRec] })
    if (String(url).startsWith('/__lab/l2r?take=')) return ok(ready)
    if (init?.method === 'POST') { posts.push(String(url)); return ok({ error: 'no' }, 409) }
    return ok({ error: 'no' }, 404)
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); publishHero(null); setPieceBuildApi(null); resetCurrentTake(); resetClayStore(); resetSceneJobs(); resetL2RStore(); localStorage.clear() })

describe('the Stage while a 3D piece builds', () => {
  it('says a piece is building and holds Draw and Render with that title; a held press spends nothing', async () => {
    running = { since: 't', what: 'a 3D piece of @crate' }
    const p = press()
    publishHero({ prompt: {} as never, overlay: null, press: p })
    render(<Stage lab={lab()} />)
    await waitFor(() => expect(screen.getAllByTestId('piece-building').length).toBeGreaterThan(0))
    for (const n of screen.getAllByTestId('piece-building')) expect(n.textContent).toBe(`${PIECE_BUILDING}.`)
    const draw = screen.getByTestId('hero-render') as HTMLButtonElement
    expect(draw.disabled).toBe(true)
    expect(draw.title).toBe(PIECE_BUILDING)
    const rnd = screen.getByTestId('render-primary') as HTMLButtonElement
    await waitFor(() => expect(rnd.title).toBe(PIECE_BUILDING))
    expect(rnd.disabled).toBe(true)
    fireEvent.click(draw); fireEvent.click(rnd)
    expect(p.onPress).not.toHaveBeenCalled()
    expect(posts).toEqual([])
  })

  it('with nothing building the note is gone and both presses are live', async () => {
    publishHero({ prompt: {} as never, overlay: null, press: press() })
    render(<Stage lab={lab()} />)
    const rnd = await screen.findByTestId('render-primary') as HTMLButtonElement
    await waitFor(() => expect(rnd.disabled).toBe(false))
    await waitFor(() => expect(pieces.get).toHaveBeenCalledWith('loc-1'))
    expect(screen.queryByTestId('piece-building')).toBeNull()
    expect((screen.getByTestId('hero-render') as HTMLButtonElement).disabled).toBe(false)
  })

  it('holds only a paid render: Export and the free Finish are never held', () => {
    const base: Primary = { action: 'l2r', verb: 'Render', price: 21, disabled: false, why: null, run: () => {} }
    expect(holdForBuild(base, true)).toMatchObject({ disabled: true, why: PIECE_BUILDING })
    expect(holdForBuild(base, false)).toBe(base)
    const exp: Primary = { ...base, action: 'export', verb: 'Export', price: null }
    expect(holdForBuild(exp, true)).toBe(exp)
    const fin: Primary = { ...base, action: 'l2r-finish', verb: 'Finish', price: 0 }
    expect(holdForBuild(fin, true)).toBe(fin)
  })
})

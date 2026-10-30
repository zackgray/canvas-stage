// @vitest-environment jsdom
// One "a 3D piece is building" answer for the whole Stage (pieceBuilding.ts): the steps line, the take card's Draw press
// (beside the Prompt box, owner 10-29) and every copy of
// usePieces (the piece panel, the Set panel) read it, so they agree from the moment a build starts on this page, an automatic
// build of a Stage-made prop or a press of Build in 3D, not only once the pieces route's poll comes round (3 s). The words
// drawer holds no press of its own (duplicate-draw-buttons: the one Draw press is the take card's), so it has nothing to hold.
// The server here never reports a build running, so only the page's own signal can hold the presses. Nothing is sent or spent.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OperatorEngine } from '../../../labs/controller/engine/engine'
import { STAGE_RIGS } from '../../../labs/projection/operator/link'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import type { L2RListResponse, TakeRecord } from '../../../shared/shotContract'
import { resetSceneJobs } from '../../../jobs/sceneJobs'
import { fakeApi, WORLD } from '../../scene/__tests__/fakes'
import type { BriefApi } from '../../scene/briefApi'
import { freshDesign } from '../../scene/design/state'
import { resetAutoBuilds, startAutoBuild } from '../../scene/pieceAutoBuild'
import type { PieceRecord, PiecesApi, PiecesResponse } from '../../scene/piecesApi'
import { usePieces } from '../../scene/usePieces'
import { resetL2RStore } from '../../render/l2rStore'
import type { L2RStatusExtra } from '../../render/l2rExtra'
import { publishHero, type HeroPressModel } from '../../shoot/heroPublished'
import { resetCurrentTake, setCurrentTake } from '../../shoot/currentTake'
import { resetClayStore } from '../../shoot/takeClay'
import { ShotSteps } from '../panels/ShotSteps'
import { TakeCard } from '../TakeCard'
import { BUILD_POLL_MS, setPieceBuildApi } from '../pieceBuilding'
import { Drawer, resetDrawerChoice } from '../PromptDrawer'

const TAKE = 'take-2026-10-22T19-00-00-000'
const takeRec: TakeRecord = { id: TAKE, worldId: WORLD, packId: null, fps: 24, frames: 97, samples: [], focal: 35, viewAspect: 1.77, perfStart: 0, startKey: 'k', lockedAt: '2026-10-22T19:00:00.000Z', createdAt: '2026-10-22T19:00:00.000Z' }
const ready: L2RListResponse & L2RStatusExtra = { renders: [], take: takeRec, clay: { takeId: TAKE, startKey: 'k', mp4: '/clay.mp4', frames: 97, width: 1920, height: 1088, status: 'done' },
  still: { id: 'still-1', takeId: TAKE, startKey: 'k', png: '/s.png', seed: 1, jobId: null, credits: 1, approved: true, createdAt: 't' }, missing: [], prompt: 'A figure.', configured: true,
  estimate: { credits: 21, perFrame: 0.21, frames: 97, basis: 'about 0.21 cr per frame' }, running: null, finishing: [] }
const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
const idle = (): PiecesResponse => ({ price: 8, tiles: [{ tag: 'crate', name: 'Crate', look: '/l/crate.png', status: 'none' }], running: null, setChangedAt: null, stillStale: false })

let done: (r: PieceRecord) => void
const pieces: PiecesApi = {
  get: vi.fn(async () => idle()), // the server never says running: only the page's own signal can hold the presses
  build: vi.fn(() => new Promise<PieceRecord>((r) => { done = r })), recover: vi.fn(), complete: vi.fn(),
}
const lab = () => ({
  op: { mode: 'orbit', setMode: vi.fn(), note: null, engine: new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false }) },
  stage: null, kit: { id: WORLD, world: null },
  s: { source: WORLD, look: 'textured' }, set: vi.fn(), shot: undefined, shots: [], pickSource: vi.fn(),
  performance: { listed: true, packs: [], selected: null, select: vi.fn(), phase: null, error: null, layer: null, plateAvailable: false, plateOn: true, setPlateOn: vi.fn() },
}) as unknown as ProjectionLabState
const press = (): HeroPressModel => ({ price: 39, drawing: false, phase: null, since: null, gate: null, title: 'Draws the first frame', disabled: false, onPress: vi.fn() })
const io = () => ({ loadDraft: vi.fn(async () => ({ ...freshDesign(), screen: 'board', phase: 'board', brief: 'A yard. @crate by the door.' })), saveDraft: vi.fn(async () => {}), uploadReference: vi.fn(), status: vi.fn(async () => { throw new Error('no planner here') }) }) as unknown as BriefApi
const NO_STILL = { read: vi.fn(), render: vi.fn(), upload: vi.fn() }

/** a piece panel's copy of usePieces (the Set panel and the rail each hold their own) */
function Copy({ id }: { id: string }) {
  const p = usePieces(WORLD, pieces, NO_STILL as never)
  return <span data-testid={id}>{`${p.pieceBuilding} ${'crate' in p.busy}`}</span>
}
function Page() {
  return (<>
    <ShotSteps lab={lab()} />
    <TakeCard lab={lab()} takeId={TAKE} />
    <Drawer scene="sc-seam" worldId={WORLD} deps={{ api: io(), bible: fakeApi().api }} />
    <Copy id="panel" /><Copy id="set" />
  </>)
}
let p: ReturnType<typeof usePieces> | null = null
function Presser() { p = usePieces(WORLD, pieces, NO_STILL as never); return null }

beforeEach(() => {
  setCurrentTake(TAKE); setPieceBuildApi(pieces); resetDrawerChoice()
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/__lab/takes') return ok({ takes: [takeRec] })
    if (String(url).startsWith('/__lab/l2r?take=')) return ok(ready)
    return ok({ error: 'no' }, 404)
  }))
  publishHero({ prompt: {} as never, overlay: null, press: press() })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); publishHero(null); setPieceBuildApi(null); resetAutoBuilds(); resetCurrentTake(); resetClayStore(); resetSceneJobs(); resetL2RStore(); localStorage.clear(); p = null })

const quick = { timeout: BUILD_POLL_MS / 3 } // well inside one poll: the answer is the page's own, never the poll's
async function allHeld(held: boolean) {
  await waitFor(() => expect(screen.queryAllByTestId('piece-building').length > 0).toBe(held), quick)
  expect((screen.getByTestId('hero-render') as HTMLButtonElement).disabled).toBe(held)
  expect(screen.queryByTestId('drawer-redraw')).toBeNull() // the drawer holds no press: nothing there to hold
  expect(screen.getByTestId('panel').textContent).toBe(`${held} ${held}`)
  expect(screen.getByTestId('set').textContent).toBe(`${held} ${held}`)
}

describe('one piece-building answer across the Stage', () => {
  it("a Stage-made prop placed: its automatic build holds the steps line, the take card's Draw and every piece panel at once", async () => {
    render(<Page />)
    await screen.findByTestId('prompt-drawer')
    await allHeld(false)
    act(() => { startAutoBuild(pieces, WORLD, 'crate') })
    await allHeld(true)
    await act(async () => { done({} as PieceRecord) })
    await allHeld(false)
  })

  it("Build in 3D pressed in one panel: the other panel, the steps line and the take card's Draw hold too, and all let go when it ends", async () => {
    render(<><Page /><Presser /></>)
    await screen.findByTestId('prompt-drawer')
    await allHeld(false)
    act(() => { void p!.build(idle().tiles[0]) })
    await allHeld(true)
    expect(pieces.build).toHaveBeenCalledTimes(1)
    await act(async () => { done({} as PieceRecord) })
    await allHeld(false)
  })
})

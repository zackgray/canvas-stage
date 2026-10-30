// @vitest-environment jsdom
// The Camera panel's take controls: Lock take (one line of status) and Played by (asked only with two or more cast) in the Camera
// view's right panel, with one "Take locked · New take" line; the first frame's priced press is the take card's beside the Prompt
// box (owner 10-29; the still block in the workspace is its no-UI publisher), exactly once. Routes faked
// (shoot/__tests__/heroStillHarness); no Cloud, no credits.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StageOperatorEngine } from '../../../labs/projection/operator/stageEngine'
import { STAGE_RIGS } from '../../../labs/projection/operator/link'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { StageWorkspace } from '../StageWorkspace'
import { StageRail } from '../StageRail'
import { StageRailProvider } from '../railBus'
import { DrawBar } from '../DrawBar'
import { TakeCard } from '../TakeCard'
import { base, serve } from '../../shoot/__tests__/heroStillHarness'
import { resetCurrentTake, setCurrentTake } from '../../shoot/currentTake'
import { resetClayStore } from '../../shoot/takeClay'
import { resetSceneJobs } from '../../../jobs/sceneJobs'
import { world0 } from './liveFakes'
import { heroCredits } from '../../../../server/hero/spec'

beforeEach(() => { setCurrentTake('take-1'); serve(base()) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetClayStore(); resetSceneJobs(); localStorage.clear() })

/** the lab slice around the faked world (take-1 is on loc-1; the performer has no one yet: "Played by" asks) */
function fakeLab() {
  return {
    op: { mode: 'orbit', setMode: vi.fn(), note: null, engine: new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false }) },
    stage: null,
    s: { source: 'loc-1', look: 'textured' }, set: vi.fn(), shot: undefined, shots: [], pickSource: vi.fn(),
    kit: { id: world0.id, world: world0, perf: world0.perf, error: null, layer: null },
    performance: { listed: true, packs: [{ id: 'pack-1', label: 'A walk', frames: 120 }], selected: 'pack-1', select: vi.fn(), phase: null, error: null, layer: null, plateAvailable: false, plateOn: true, setPlateOn: vi.fn() },
  } as unknown as ProjectionLabState
}

/** the Bible read "Played by" offers: two cast characters, so the ask shows above the still's press */
function serveBible() {
  const served = fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url)
    if (path.startsWith('/__lab/bible?')) {
      return new Response(JSON.stringify({ bible: { worldId: world0.id, version: 1, prompt: '', master: null, candidates: [], elements: [
        { tag: 'ana', kind: 'cast', cardId: 'ana', refs: [], line: '' }, { tag: 'bob', kind: 'cast', cardId: 'bob', refs: [], line: '' }] }, running: null }), { status: 200 })
    }
    if (path.startsWith('/__lab/project/')) return new Response('null', { status: 404 }) // no project in this test
    return served(url, init)
  }))
}

const renderWs = (ui: React.ReactElement) => render(<StageRailProvider>{ui}<StageRail show /></StageRailProvider>)

describe("the Camera panel's take controls", () => {
  it("holds Lock take and Played by; no Performance select; the take card's press is there once a still can be drawn, exactly once", async () => {
    serveBible()
    const lab = fakeLab()
    renderWs(<><StageWorkspace lab={lab} panes={['camera']} /><DrawBar lab={lab} /><TakeCard lab={lab} takeId="take-1" /></>)
    await waitFor(() => expect(screen.getByTestId('take-lock')).toBeTruthy()) // the locked take, from the takes route
    await waitFor(() => expect(screen.getByTestId('take-locked').textContent).toBe('Take locked · New take'))
    await waitFor(() => expect(screen.getByTestId('played-by-ask')).toBeTruthy()) // two characters, no one named yet
    expect(screen.queryByTestId('performance-pick')).toBeNull()
    const press = await screen.findByTestId('hero-render') as HTMLButtonElement
    expect(press.parentElement?.textContent).toMatch(new RegExp(`${heroCredits(1)} cr`))
    expect(screen.getAllByTestId('hero-render')).toHaveLength(1)
  })

  it("with the take locked, New take is the Camera panel's one 'Take locked · New take' line; the steps line has none", async () => {
    serveBible()
    const lab = fakeLab()
    renderWs(<><StageWorkspace lab={lab} panes={['camera']} /><DrawBar lab={lab} /><TakeCard lab={lab} takeId="take-1" /></>)
    await waitFor(() => expect(screen.getByTestId('take-lock')).toBeTruthy())
    await waitFor(() => expect(screen.getByTestId('take-locked').textContent).toBe('Take locked · New take'))
    for (const gone of ['new-take-line', 'new-take', 'step-new-take']) expect(screen.queryByTestId(gone)).toBeNull()
    expect(screen.getByTestId('shot-steps').textContent).not.toMatch(/New take|Record starts a new take/)
    const nt = screen.getByTestId('camera-new-take-btn') as HTMLButtonElement
    expect(nt.disabled).toBe(false)
    await act(async () => { fireEvent.click(nt) }) // New take starts an open take from what is on screen: nothing records
    expect(lab.op.engine.deck.recording).toBe(false)
  })
})

describe('the one Draw the first frame press (duplicate-draw-buttons)', () => {
  it('is the take card\'s own (beside the Prompt box), reachable in every view: the Camera view and the Free view / Top View both show it once', async () => {
    serveBible()
    const cam = fakeLab()
    renderWs(<><StageWorkspace lab={cam} panes={['camera']} /><DrawBar lab={cam} /><TakeCard lab={cam} takeId="take-1" /></>)
    await waitFor(() => expect(screen.getAllByTestId('hero-render')).toHaveLength(1))
    cleanup()
    const free = fakeLab()
    renderWs(<><StageWorkspace lab={free} panes={['free', 'top']} /><DrawBar lab={free} /><TakeCard lab={free} takeId="take-1" /></>)
    await waitFor(() => expect(screen.getAllByTestId('hero-render')).toHaveLength(1))
    expect(screen.queryByTestId('drawer-redraw')).toBeNull() // the words bar has no copy of the press
  })
})

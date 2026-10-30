// @vitest-environment jsdom
// The Stage shell (the merge; the Stage simplification): a clickable status line (each phrase selects the thing it names; the view
// switch beside it) and the panel host: nothing picked -> the set panel in Free view / Top View, the Camera panel in the Camera
// view. One camera mode: the Operator, set as the Stage opens.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OperatorEngine } from '../../../labs/controller/engine/engine'
import { STAGE_RIGS } from '../../../labs/projection/operator/link'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { StageWorkspace } from '../StageWorkspace'
import { StageRailProvider } from '../railBus'
import { useHeroPublished } from '../../shoot/heroPublished'
import { fakeApi } from '../../scene/__tests__/fakes'
import { ID, world0 } from './liveFakes'
import { openScene, resetCurrentScene } from '../../../library/currentScene'
import type { LibraryApi } from '../../../library/api'
import type { SceneView } from '../../../shared/libraryContract'

vi.mock('../panels/blocking', () => ({ BlockingPanel: () => <section data-testid="blocking-stub" /> }))

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })

/** L2: the workspace publishes the rail's content through the bus; the provider stands in for the shell here */
const renderWs = (ui: React.ReactElement) => render(<StageRailProvider>{ui}</StageRailProvider>)

/** the lab slice the panel reads, around a real operator engine, on the faked Set world */
function fakeLab() {
  // not approved: the Approve the set press shows, so the set card is visibly the Set step
  const { api } = fakeApi(null, null, { approved: false })
  const lab = {
    op: { mode: 'operator', setMode: vi.fn(), note: null, engine: new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false }) },
    stage: null,
    s: { source: 'synthetic' }, shot: undefined, shots: [], pickSource: vi.fn(),
    kit: { id: ID, world: world0, perf: world0.perf, error: null, layer: null },
    performance: { listed: true, packs: [], selected: null, select: vi.fn(), phase: null, error: null, layer: null, plateAvailable: false, plateOn: true, setPlateOn: vi.fn() },
  } as unknown as ProjectionLabState
  return { lab, api }
}

describe('Stage workspace', () => {
  it('opens on the set panel (nothing picked shows only the set approval and Reset the set); the status line names the set and the subject and hosts the view switch', async () => {
    const { lab, api } = fakeLab()
    renderWs(<StageWorkspace lab={lab} api={api} panes={['free']} />)
    const status = screen.getByTestId('stage-status').textContent!
    for (const s of ['The set', 'The subject']) expect(status).toContain(s)
    for (const s of ['The shot', 'The first frame']) expect(status).not.toContain(s)
    expect(screen.getByTestId('stage-panes')).toBeTruthy()
    expect(screen.getByTestId('scene-panel')).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('set-approve')).toBeTruthy())
    expect(screen.queryByTestId('scene-draw-master')).toBeNull() // the look is not drawn from the Stage
    for (const id of ['card-shot', 'camera-mode', 'hero-block', 'take-lock', 'scene-board', 'scene-set'])
      expect(screen.queryByTestId(id)).toBeNull()
    expect(lab.op.setMode).toHaveBeenCalledWith('operator') // one camera mode for the Stage's whole life
  })

  it("the status phrases are buttons that select the thing they name: 'The subject' selects the mark, 'The set' clears it", async () => {
    const { lab, api } = fakeLab()
    renderWs(<StageWorkspace lab={lab} api={api} panes={['free']} />)
    await waitFor(() => expect(screen.getByTestId('set-approve')).toBeTruthy())
    const set = screen.getByTestId('stage-word-set')
    const subject = screen.getByTestId('stage-word-subject')
    expect(set.getAttribute('aria-pressed')).toBe('true') // nothing picked: the set is the named thing
    expect(subject.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(subject)
    expect(subject.getAttribute('aria-pressed')).toBe('true')
    expect(set.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(set)
    expect(set.getAttribute('aria-pressed')).toBe('true')
    expect(subject.getAttribute('aria-pressed')).toBe('false')
  })
})

describe('the Camera view', () => {
  it('the Camera pane alone shows the Camera panel: shot length and camera moves, no Camera tabs, no Performance select, no Advanced, never Approve the set', async () => {
    const { lab, api } = fakeLab()
    renderWs(<StageWorkspace lab={lab} api={api} panes={['camera']} />)
    expect(screen.getByTestId('scene-panel')).toBeTruthy()
    expect(screen.getByTestId('card-shot')).toBeTruthy()
    expect(screen.getByTestId('shot-length-row')).toBeTruthy()
    for (const id of ['camera-mode', 'card-set', 'card-first-frame', 'performance-pick', 'performance-none', 'advanced-shoot', 'orbit-help', 'first-frame-mood'])
      expect(screen.queryByTestId(id)).toBeNull()
    await waitFor(() => expect(screen.queryByTestId('set-approve')).toBeNull()) // never in the Camera view
  })

  it('Free and Top without the Camera show the set panel (never the Camera panel)', async () => {
    const { lab, api } = fakeLab()
    renderWs(<StageWorkspace lab={lab} api={api} panes={['free', 'top']} />)
    await waitFor(() => expect(screen.getByTestId('set-approve')).toBeTruthy())
    expect(screen.queryByTestId('scene-draw-master')).toBeNull()
    expect(screen.queryByTestId('card-shot')).toBeNull()
  })

  it('the Camera beside the Free view keeps the Camera panel until a press lands in the Free view (cameraPanelFollow.test.tsx)', async () => {
    const { lab, api } = fakeLab()
    renderWs(<StageWorkspace lab={lab} api={api} panes={['camera', 'free']} />)
    expect(screen.getByTestId('card-shot')).toBeTruthy()
    expect(screen.queryByTestId('set-approve')).toBeNull()
  })

  it('the hero publisher stays mounted for the draw bar, whatever is picked', async () => {
    const { lab, api } = fakeLab()
    const Probe = () => <div data-testid="hero-published">{useHeroPublished() ? 'yes' : 'no'}</div>
    renderWs(<><StageWorkspace lab={lab} api={api} panes={['camera']} /><Probe /></>)
    await waitFor(() => expect(screen.getByTestId('hero-published').textContent).toBe('yes'))
    fireEvent.click(screen.getByTestId('stage-word-subject'))
    expect(screen.getByTestId('hero-published').textContent).toBe('yes')
  })

  it('a scene read with no world shows the starting line over the viewport instead of the status line, the panels and the steps', async () => {
    const SC = 'sc-20261029020000-wsup'
    let worldId: string | null = null
    const view = (): SceneView => ({ id: SC, name: 'S', revision: 1, hidden: false, createdAt: 't', updatedAt: 't', worldId, worlds: [],
      summary: { id: SC, name: 'S', thumbnail: null, stage: 'brief', lastEdited: 't', hidden: false, revision: 1 }, facts: { setBuilt: false, briefChanged: false, takes: {} } })
    resetCurrentScene({ get: vi.fn(async () => view()) } as unknown as LibraryApi); openScene(SC)
    const host = document.createElement('div'); host.setAttribute('data-testid', 'studio-viewport'); document.body.appendChild(host)
    const { lab, api } = fakeLab()
    renderWs(<StageWorkspace lab={lab} api={api} panes={['free']} />)
    await waitFor(() => expect(screen.getByTestId('starting-stage')).toBeTruthy())
    expect(screen.getByTestId('setup-viewport').textContent).toBe('Opening an empty stage…')
    expect(host.contains(screen.getByTestId('setup-viewport'))).toBe(true) // drawn over the shell's viewport
    for (const id of ['stage-status', 'scene-panel', 'hero-block']) expect(screen.queryByTestId(id)).toBeNull()
    // the world lands: the scene's facts name it and the Stage is the normal Stage
    worldId = ID
    const { refreshScene } = await import('../../../library/currentScene')
    await act(async () => { await refreshScene() })
    await waitFor(() => expect(screen.getByTestId('stage-status')).toBeTruthy())
    expect(screen.queryByTestId('starting-stage')).toBeNull()
    resetCurrentScene(); host.remove()
  })
})

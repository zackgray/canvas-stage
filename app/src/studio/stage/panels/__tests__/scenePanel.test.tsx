// @vitest-environment jsdom
// The Scene panel (merge step 6a; layout wave L4): the panel host's nothing-picked route and its two states. Free view / Top
// plan: the slim set panel — the set's approval and Reset the set only (the set is approved when built; the master look is not drawn here);
// never the shot card, the scene-level rows, words editing or a prompt preview. Camera view: the shot card's camera items only.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OperatorEngine } from '../../../../labs/controller/engine/engine'
import { STAGE_RIGS } from '../../../../labs/projection/operator/link'
import type { ProjectionLabState } from '../../../../labs/projection/useProjectionLab'
import { StagePanel } from '../StagePanel'
import { useSetPlace } from '../../../scene/useSetPlace'
import type { StagePick } from '../../useStagePick'
import type { PiecesApi } from '../../../scene/piecesApi'
import type { BibleRecord } from '../../../../shared/bibleContract'
import { blank, fakeApi } from '../../../scene/__tests__/fakes'
import { ID, world0 } from '../../__tests__/liveFakes'

vi.mock('../blocking', () => ({ BlockingPanel: () => <section data-testid="blocking-stub" /> }))
// the pre-press read of the world as the server has it (a master depth already there: nothing to render in jsdom)
vi.mock('../../../../labs/projection/stage3d/kitApi', async (orig) => ({
  ...(await orig<typeof import('../../../../labs/projection/stage3d/kitApi')>()),
  getKitWorld: async () => ({ ...(await import('../../__tests__/liveFakes')).world0, masterDepth: '/depth.png' }),
}))

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })

/** the lab slice the panel reads, around a real operator engine, on the faked Set world (not approved: Approve the set shows) */
function fakeLab() {
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

/** the panel host with its selection's composing state, as the Stage shell wires it (nothing picked here: the Scene panel) */
function mount(lab: ProjectionLabState, api: ReturnType<typeof fakeApi>['api'], pick: StagePick | null = null, cameraView = false, pieces?: PiecesApi) {
  function Host() {
    const place = useSetPlace(lab.kit.world)
    return <StagePanel lab={lab} api={api} pick={pick} select={vi.fn()} place={place} cameraView={cameraView} pieces={pieces} />
  }
  return render(<Host />)
}

describe('Scene panel (L4: the right panel\'s two states)', () => {
  it('Free view / Top View, nothing picked: only the set approval and Reset the set; the look is not drawn from here', async () => {
    const { lab, api } = fakeLab()
    mount(lab, api)
    expect(screen.getByTestId('scene-panel')).toBeTruthy()
    const card = screen.getByTestId('card-set')
    await waitFor(() => expect(card.querySelector('[data-testid="set-approve"]')).toBeTruthy())
    expect(screen.getByTestId('set-reset')).toBeTruthy()
    // no Draw the look, no "how many" choice, no drawn looks, no stale-master line: the master is not surfaced at all
    for (const id of ['scene-draw-master', 'scene-draw', 'scene-master-count', 'stage-look', 'set-pieces-moved'])
      expect(screen.queryByTestId(id)).toBeNull()
    expect(card.textContent).not.toMatch(/Draw the look|master/i)
    // nothing else: no shot card, no scene-level rows, no words editing, no prompt preview, no master board
    for (const id of ['card-shot', 'camera-mode', 'hero-block', 'performance-none', 'take-lock', 'scene-board', 'scene-set', 'set-pieces'])
      expect(screen.queryByTestId(id)).toBeNull()
    expect(screen.getByTestId('scene-panel').querySelector('textarea, input:not([type=button]):not([type=submit])')).toBeNull()
  })

  it('the set approved says so; a changed set offers the one plain button, Approve the changed set (free)', async () => {
    const ok = fakeApi(null, null, { approved: true })
    mount(fakeLab().lab, ok.api)
    expect((await screen.findByTestId('set-approved')).textContent).toBe('The set is approved.')
    cleanup()
    const stale = fakeApi(null, null, { approved: true })
    stale.moveSet()
    mount(fakeLab().lab, stale.api)
    await waitFor(() => expect(screen.getByTestId('set-approve').textContent).toBe('Approve the changed set'))
  })

  it('a scene that already has an approved master opens fine: nothing about the master shows, and no error', async () => {
    const rec: BibleRecord = {
      ...blank(ID),
      master: { id: 'm1', png: '/m1.png', madeBy: 'qwen-image-2512+depth', seed: 1, depthStrength: 0.9, jobId: 'j1', credits: 14, createdAt: '2026-10-25T10:00:00.000Z' },
    }
    const { api } = fakeApi(rec, null, { approved: true })
    const pieces: PiecesApi = {
      get: async () => ({ price: 6, running: null, setChangedAt: '2026-10-25T11:00:00.000Z', stillStale: false, tiles: [] }),
      build: vi.fn(), recover: vi.fn(), complete: vi.fn(),
    }
    mount(fakeLab().lab, api, null, false, pieces)
    await screen.findByTestId('card-set')
    await new Promise((r) => setTimeout(r, 30))
    for (const id of ['set-pieces-moved', 'stage-look', 'scene-draw-master', 'scene-error']) expect(screen.queryByTestId(id)).toBeNull()
  })

  it('Camera view, nothing picked: the Camera panel (shot length, camera moves); no Camera tabs, no Advanced, never Approve the set or Draw the look', async () => {
    const { lab, api } = fakeLab()
    mount(lab, api, null, true)
    const card = screen.getByTestId('card-shot')
    expect(card.querySelector('[data-testid="shot-length"]')).toBeTruthy()
    for (const id of ['camera-mode', 'record', 'card-shot-meta', 'card-first-frame', 'hero-block', 'advanced-shoot', 'card-set', 'set-approve', 'scene-draw'])
      expect(screen.queryByTestId(id)).toBeNull()
  })
})

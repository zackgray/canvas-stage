// @vitest-environment jsdom
// The Set panel on an empty world (the Stage's own starting world): hide-set-build — the planner's "Lay out the set from my words"
// press is switched off, so an empty world offers no priced press at all (the planner code stays, back with the bigger library),
// and there is no approval and no Reset the set wording. With pieces placed: the approval and Reset the set, which asks first (it
// empties the world); the legacy Build the set again is gone. The sun control is unmounted everywhere (sun-is-preview). The planner
// and the kit build are mocked; nothing spends.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SceneJobs } from '../../../../jobs/sceneJobs'
import type { KitWorld } from '../../../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../../../labs/projection/useProjectionLab'
import { EMPTY_PLAN } from '../../../scene/design/useBuildSet'
import { fakeBrief, type FakeBrief } from '../../../scene/__tests__/briefFakes'
import { fakeApi, kitDeps, kitShot } from '../../../scene/__tests__/fakes'
import { freshDesign, markUnsynced, saveDesign } from '../../../scene/design/state'
import type { PiecesApi } from '../../../scene/piecesApi'
import { StageSceneProvider } from '../../scene/StageScene'
import { SetPanel } from '../SetPanel'

const SCENE = 'sc-20261028040000-sete'
const WORDS = 'A small farmhouse kitchen at dawn. Mara lifts the copper kettle off the stove.'
const EMPTY_WORLD: KitWorld = { id: 'loc-empty', description: '', plan: EMPTY_PLAN, perf: { path: [[0.6, -12.5]], pace: 0.8 }, still: null, createdAt: '' }
const PLACED_WORLD: KitWorld = { ...EMPTY_WORLD, id: 'loc-placed', plan: { ...EMPTY_PLAN, kit: [{ kind: 'tree', at: [1, 2] }] } }

let brief: FakeBrief, bible: ReturnType<typeof fakeApi>, kit: ReturnType<typeof kitDeps>, jobs: SceneJobs
const pieces: PiecesApi = { get: vi.fn(async () => ({ price: 12, tiles: [], running: null, setChangedAt: null, stillStale: false })), build: vi.fn(), recover: vi.fn(), complete: vi.fn() }

beforeEach(() => {
  localStorage.clear()
  brief = fakeBrief(); bible = fakeApi(null, null, { approved: false }); kit = kitDeps(); jobs = new SceneJobs(null)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 404 }))) // no project (no saved cast cards)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

const mount = (world: KitWorld, reset: (id: string) => Promise<unknown> = vi.fn()) => {
  saveDesign({ ...freshDesign(), brief: WORDS }, SCENE); markUnsynced(SCENE)
  const l = { kit: { id: world.id, world }, refreshShots: vi.fn(async () => [kitShot]), set: vi.fn() } as unknown as ProjectionLabState
  return render(<StageSceneProvider scene={SCENE} worldId={world.id} lab={l} deps={{ api: brief, bible: bible.api, jobs, buildKit: kit }}>
    <SetPanel lab={l} api={bible.api} pieces={pieces} reset={reset} />
  </StageSceneProvider>)
}
const press = async (id: string) => { await act(async () => { fireEvent.click(screen.getByTestId(id)) }) }

describe('the Set panel on an empty world', () => {
  it('offers no lay-out press: the planner is switched off, nothing is priced, pressing nothing plans', async () => {
    mount(EMPTY_WORLD)
    await screen.findByTestId('scene-panel')
    expect(screen.queryByTestId('set-rebuild-press')).toBeNull()
    expect(screen.queryByTestId('set-rebuild')).toBeNull()
    expect(screen.getByTestId('scene-panel').textContent).not.toMatch(/Lay out the set|cr\b/)
    expect(brief.plan).not.toHaveBeenCalled()
    expect(kit.create).not.toHaveBeenCalled()
  })

  it('says nothing about an approval and offers no Reset the set', async () => {
    mount(EMPTY_WORLD)
    await screen.findByTestId('scene-panel')
    for (const id of ['set-approve', 'set-approved', 'set-reset']) expect(screen.queryByTestId(id)).toBeNull()
    expect(screen.getByTestId('scene-panel').textContent).not.toMatch(/The set is approved|Reset the set/)
  })

  it('shows no sun control (one default light; the sky is track B\'s)', async () => {
    mount(EMPTY_WORLD)
    await screen.findByTestId('scene-panel')
    expect(screen.queryByTestId('sun')).toBeNull()
  })
})

describe('the Set panel with pieces placed', () => {
  it('keeps the approval and Reset the set; no Build the set again, nothing priced, no sun control', async () => {
    mount(PLACED_WORLD)
    await screen.findByTestId('set-approve') // the fake's world is not approved
    expect(screen.getByTestId('set-reset')).toBeTruthy()
    for (const id of ['set-rebuild', 'set-rebuild-press', 'build-ask', 'sun']) expect(screen.queryByTestId(id)).toBeNull()
    expect(screen.getByTestId('scene-panel').textContent).not.toMatch(/Build the set|Write the scene words first|\d cr\b/)
    expect(brief.plan).not.toHaveBeenCalled()
  })

  it('Reset the set asks first: Cancel keeps every piece, Reset empties the set', async () => {
    const reset = vi.fn(async () => ({}))
    mount(PLACED_WORLD, reset)
    await press('set-reset')
    expect(screen.getByTestId('set-reset-ask').textContent).toMatch(/Reset the set\? This removes every piece\./)
    expect(reset).not.toHaveBeenCalled()
    await press('set-reset-ask-no')
    expect(screen.queryByTestId('set-reset-ask')).toBeNull()
    expect(reset).not.toHaveBeenCalled()
    await press('set-reset')
    await press('set-reset-ask-yes')
    expect(reset).toHaveBeenCalledTimes(1)
    expect(reset).toHaveBeenCalledWith('loc-placed')
    expect(screen.queryByTestId('set-reset-ask')).toBeNull()
  })

  it('the Ground row is the first row of the set card, on a new (flat) world as on a placed one', async () => {
    for (const w of [EMPTY_WORLD, PLACED_WORLD]) {
      mount(w)
      const card = await screen.findByTestId('card-set')
      expect(card.children[1].getAttribute('data-testid')).toBe('set-ground-row') // after the card's heading
      expect(screen.getByTestId('set-ground-flat').getAttribute('aria-pressed')).toBe('true')
      cleanup()
    }
  })

  it('Escape backs out of the ask', async () => {
    const reset = vi.fn(async () => ({}))
    mount(PLACED_WORLD, reset)
    await press('set-reset')
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(screen.queryByTestId('set-reset-ask')).toBeNull()
    expect(reset).not.toHaveBeenCalled()
  })
})

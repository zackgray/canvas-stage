// @vitest-environment jsdom
// Review F1, the page half: while a locked take with its own set is on show, the set panel's Approve approves THAT set (its key is
// sent) and says so by the take's name; it reads approved when the take's key is among the world's approved keys, whatever the
// scene's approval says. With no take on show the panel approves the scene's set, as before. Nothing spends.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SceneJobs } from '../../../../jobs/sceneJobs'
import type { KitWorld } from '../../../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../../../labs/projection/useProjectionLab'
import { EMPTY_PLAN } from '../../../scene/design/useBuildSet'
import { fakeBrief } from '../../../scene/__tests__/briefFakes'
import { fakeApi, kitDeps, kitShot } from '../../../scene/__tests__/fakes'
import { freshDesign, markUnsynced, saveDesign } from '../../../scene/design/state'
import type { PiecesApi } from '../../../scene/piecesApi'
import { StageSceneProvider } from '../../scene/StageScene'
import { SetPanel } from '../SetPanel'
import { SetRefusal } from '../SetRefusal'
import { noteSceneSet, resetTakeOnShow, setTakeOnShow } from '../../../../labs/projection/stage3d/takeOnShow'
import { SET_NOT_APPROVED } from '../../../../shared/setApproval'

const SCENE = 'sc-20261028040000-owna'
const WORLD: KitWorld = { id: 'loc-owned', description: '', plan: { ...EMPTY_PLAN, kit: [{ kind: 'tree', at: [1, 2] }] }, perf: { path: [[0.6, -12.5]], pace: 0.8 }, still: null, createdAt: '' }
const OWN = 'own00001'
const TAKE = { id: 'take-2026-10-28T10-00-00-000', worldId: WORLD.id, name: 'The kettle', lockedAt: '2026-10-28T10:00:00.000Z', setKey: OWN }
const pieces: PiecesApi = { get: vi.fn(async () => ({ price: 12, tiles: [], running: null, setChangedAt: null, stillStale: false })), build: vi.fn(), recover: vi.fn(), complete: vi.fn() }

let bible: ReturnType<typeof fakeApi>
beforeEach(() => {
  localStorage.clear()
  bible = fakeApi(null, null) // the scene's set is approved at its own key
  vi.stubGlobal('fetch', vi.fn(async (u: string) => (String(u).includes('takes') ? new Response(JSON.stringify({ takes: [TAKE] }), { status: 200 }) : new Response('null', { status: 404 }))))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

const mount = (ownSet: object | null) => {
  saveDesign({ ...freshDesign(), brief: 'words' }, SCENE); markUnsynced(SCENE)
  const l = { kit: { id: WORLD.id, world: WORLD, ownSet }, refreshShots: vi.fn(async () => [kitShot]), set: vi.fn() } as unknown as ProjectionLabState
  return render(<StageSceneProvider scene={SCENE} worldId={WORLD.id} lab={l} deps={{ api: fakeBrief(), bible: bible.api, jobs: new SceneJobs(null), buildKit: kitDeps() }}>
    <SetPanel lab={l} api={bible.api} pieces={pieces} />
  </StageSceneProvider>)
}

describe('the set panel while a take with its own set is on show (review F1)', () => {
  it('is not approved by the scene\'s approval; Approve sends the take\'s key and names its set', async () => {
    mount({ takeId: TAKE.id, worldId: WORLD.id, perf: null, plan: WORLD.plan, setKey: OWN })
    const press = await screen.findByTestId('set-approve', {}, { timeout: 3000 })
    await screen.findByText(/Approve The kettle's set/)
    expect(screen.queryByTestId('set-approved')).toBeNull() // the scene's set is approved; the take's is not
    bible.api.approveSet.mockImplementationOnce(async () => ({ bible: null, running: null, setApproval: { key: 'aaaa0001', at: 't' }, setKey: 'aaaa0001', setKeys: ['aaaa0001', OWN] }))
    await act(async () => { fireEvent.click(press) })
    expect(bible.api.approveSet).toHaveBeenCalledWith(WORLD.id, OWN)
    expect((await screen.findByTestId('set-approved')).textContent).toBe("The kettle's set is approved.")
  })

  it("with no take on show the scene's approval stands, in the scene's words", async () => {
    mount(null)
    expect((await screen.findByTestId('set-approved', {}, { timeout: 3000 })).textContent).toBe('The set is approved.')
    expect(bible.api.approveSet).not.toHaveBeenCalled()
  })
})

describe("the refused press's Approve while a take with its own set is on show (review F1)", () => {
  afterEach(() => resetTakeOnShow())
  it("approves the take's set by its key and names it; with none on show, the scene's by no key", async () => {
    const approve = vi.fn(async () => ({}))
    noteSceneSet(WORLD.id, { ...WORLD.plan, kit: [] }) // the scene's set has moved on: the take's is another
    setTakeOnShow({ takeId: TAKE.id, worldId: WORLD.id, perf: null, plan: WORLD.plan, setKey: OWN })
    render(<SetRefusal text={SET_NOT_APPROVED} worldId={WORLD.id} approve={approve} />)
    const b = await screen.findByText(/Approve The kettle's set/)
    await act(async () => { fireEvent.click(b) })
    expect(approve).toHaveBeenCalledWith(WORLD.id, OWN)
    expect(screen.getByTestId('set-refusal-done').textContent).toMatch(/^The kettle's set is approved\./)
    cleanup(); resetTakeOnShow(); approve.mockClear()
    render(<SetRefusal text={SET_NOT_APPROVED} worldId={WORLD.id} approve={approve} />)
    await act(async () => { fireEvent.click(screen.getByText('Approve the set')) })
    expect(approve).toHaveBeenCalledWith(WORLD.id)
  })
})

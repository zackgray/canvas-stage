// @vitest-environment jsdom
// The joining track's intersection tests (2026-10-29), each across the parts several tracks built, every paid call faked:
//   the front door end to end: the Stage's Setup panel with the scene words, a person and a prop -> Build the set (planner and kit
//     faked) -> The subject's maker offers the person -> Generate looks -> Use this look -> the Cast card, the sheet element and
//     the performer, so the draw has someone to draw;
//   the drawer's sheet sync says an @tag with no tile as the name Build the set gives it (it used to say the bare tag).
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SceneJobs } from '../../../../jobs/sceneJobs'
import type { KitWorld } from '../../../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../../../labs/projection/useProjectionLab'
import type { SceneView } from '../../../../shared/libraryContract'
import { seedScene } from '../../../home/startScene'
import { DEVELOPED, PASTED, V2 } from '../../../scene/__tests__/developFixture'
import { fakeBrief, type FakeBrief } from '../../../scene/__tests__/briefFakes'
import { fakeApi, kitDeps, kitShot, WORLD } from '../../../scene/__tests__/fakes'
import { buildBlock } from '../../../scene/design/buildCheck'
import { castCard, freshGuided, propCard } from '../../../scene/design/guided'
import { freshDesign, markUnsynced, saveDesign } from '../../../scene/design/state'
import { SAVE_MS } from '../../../scene/design/useDesign'
import { PersonCard } from '../../panels/PersonLook'
import { SetupPanel } from '../../panels/SetupPanel'
import { StageSceneProvider, useStageScene, type KitIo, type StageScene } from '../StageScene'

const SCENE = 'sc-20261029030000-join'
const lab = () => ({ kit: { id: null, world: null }, refreshShots: vi.fn(async () => [kitShot]), set: vi.fn() }) as unknown as ProjectionLabState

let brief: FakeBrief, bible: ReturnType<typeof fakeApi>, jobs: SceneJobs
let seen: StageScene | null = null
function Peek() { seen = useStageScene(); return null }

/** the world's performance in memory (the person maker writes `castId` here) */
function world() {
  let perf: KitWorld['perf'] = { path: [[0, -12], [0, -8]] }
  const io = {
    get: vi.fn(async (id: string) => ({ id, perf }) as unknown as KitWorld),
    savePerf: vi.fn(async (id: string, p: KitWorld['perf']) => { perf = p; return { id, perf: p } as unknown as KitWorld }),
  }
  return { io: io as unknown as KitIo & typeof io, now: () => ({ id: WORLD, perf }) as unknown as KitWorld }
}

beforeEach(() => {
  localStorage.clear(); seen = null
  brief = fakeBrief({ developed: DEVELOPED }); bible = fakeApi(); jobs = new SceneJobs(null)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 404 }))) // no project (no saved cast cards)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

const press = async (id: string) => { await act(async () => { fireEvent.click(screen.getByTestId(id)) }) }
const settle = () => act(() => new Promise((r) => setTimeout(r, SAVE_MS + 150)))

describe('the front door, end to end (Home, the Stage before the set, Build the set, the person)', () => {
  it('one plan, one look job, and the performer is the card the look was saved as', async () => {
    // the scene as the Stage first sees it: the words, one person and one prop, no set
    const g = freshGuided([castCard('Mara', 'person', 'a cook in a faded blue apron')])
    saveDesign({ ...freshDesign(), brief: 'A small farmhouse kitchen at dawn. @mara lifts the copper kettle off the stove.', v2: V2,
      guided: { ...g, props: [propCard('Copper kettle', 'a dented copper kettle')] } }, SCENE); markUnsynced(SCENE)
    const w = world(), k = kitDeps()
    const ui = (worldId: string | null, children: React.ReactNode) => (
      <StageSceneProvider scene={SCENE} worldId={worldId} lab={lab()} deps={{ api: brief, bible: bible.api, jobs, buildKit: k, kit: w.io }}>
        <Peek />{children}
      </StageSceneProvider>)
    const r = render(ui(null, <SetupPanel />))

    await waitFor(() => expect(seen?.x.s.synced).toBe(true))
    expect([...screen.getByTestId('setup-people').querySelectorAll('input')].map((i) => i.value)).toEqual(['Mara'])

    // Build the set: the free check, one plan, the world, the set approved
    await waitFor(() => expect((screen.getByTestId('setup-build-press') as HTMLButtonElement).disabled).toBe(false))
    await press('setup-build-press')
    await waitFor(() => expect(bible.api.approveSet).toHaveBeenCalledTimes(1))
    expect(brief.plan).toHaveBeenCalledTimes(1)
    expect(k.create).toHaveBeenCalledTimes(1)
    expect(bible.current()!.elements).toEqual([]) // nobody has a look yet

    // the scene now names the world (the shell's facts): the normal Stage, the person card offers the developed person
    r.rerender(ui(WORLD, <PersonCard world={w.now()} onClose={() => {}} />))
    expect((await screen.findByTestId('look-desc') as HTMLTextAreaElement).value).toMatch(/faded blue apron/)
    fireEvent.click(screen.getByLabelText('More looks')) // two looks, to pick the second
    await waitFor(() => expect((screen.getByTestId('look-generate') as HTMLButtonElement).disabled).toBe(false))
    await press('look-generate')
    await waitFor(() => expect(screen.getByTestId('look-cand-1')).toBeTruthy())
    expect(brief.candidates).toHaveBeenCalledTimes(1)
    expect(brief.candidates.mock.calls[0][0]).toMatchObject({ type: 'person', name: 'Mara' })

    // Use this look: the Cast card saved with the picked face, its sheet element, and the performer names that card
    fireEvent.click(screen.getByTestId('look-cand-1'))
    await press('look-use')
    await waitFor(() => expect(w.io.savePerf).toHaveBeenCalledTimes(1))
    const card = brief.saveCard.mock.calls[0][0]
    const picked = seen!.x.s.d.guided!.cast.find((c) => c.name === 'Mara')!
    expect(card.face).toBe(picked.cands[1])
    expect(bible.current()!.elements).toEqual([expect.objectContaining({ tag: 'mara', kind: 'cast', cardId: card.cardId, refs: [picked.cands[1]] })])
    expect(w.now().perf.castId).toBe(card.cardId) // the draw's and the render's "nobody plays the person" refusal reads this
    expect(w.now().perf).not.toHaveProperty('costume')
    await settle()
    expect(seen!.x.s.d.brief).toContain('@mara lifts the copper kettle') // the words name the person by tag now
    expect(brief.develop).not.toHaveBeenCalled()
    expect(brief.plan).toHaveBeenCalledTimes(1)
  })
})

describe('the drawer and Build the set say an @tag with no tile the same way', () => {
  it('a drawer edit naming a Develop person before her look sends her name, as Build the set does', async () => {
    seedScene({ id: SCENE } as SceneView, { text: PASTED })
    render(<StageSceneProvider scene={SCENE} worldId={WORLD} lab={lab()} deps={{ api: brief, bible: bible.api, jobs }}><Peek /></StageSceneProvider>)
    await waitFor(() => expect(seen?.x.s.synced).toBe(true))
    act(() => { seen!.x.s.set({ v2: V2 }) })
    await settle()
    act(() => { seen!.x.s.editBrief('A small kitchen at dawn. @mara lifts the kettle.') })
    await waitFor(() => expect(bible.api.save).toHaveBeenCalled())
    await settle()
    // the brief's write and the prompt's own write agree (the prompt's used to follow with the bare tag, overwriting the name)
    expect(bible.api.save.mock.calls.map((c) => c[0].prompt)).toEqual(['A small kitchen at dawn. Mara lifts the kettle.'])
    expect(bible.current()!.prompt).toBe('A small kitchen at dawn. Mara lifts the kettle.')
    // and a typed tag the scene already names is no draft tile holding Build the set back (the Stage cannot approve one)
    act(() => { seen!.x.s.editBrief('A small kitchen at dawn. @mara lifts the @kettle. ') })
    expect(seen!.x.s.d.pieces).toEqual([])
    expect(buildBlock(seen!.x.s.d, seen!.x.s.board)).toBeNull()
  })
})

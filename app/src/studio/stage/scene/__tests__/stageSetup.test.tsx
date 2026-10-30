// @vitest-environment jsdom
// The Stage before the set (stage-only plan, section 1), through the Stage's one design copy and its one Build the set, every paid
// call mocked: the first prompt is the scene words as written (no Develop step); Build the set with words and no tiles
// plans (the Props list names the Guided props), writes no person without a look and says an unbacked @tag as its name; a
// rebuild keeps a prop and a person made on the Stage; a plan landing after the Setup panel is gone still builds and approves.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SceneJobs } from '../../../../jobs/sceneJobs'
import type { ProjectionLabState } from '../../../../labs/projection/useProjectionLab'
import { propsOf, sentenceOf } from '../../../../stage3d/planProps'
import type { LibraryApi } from '../../../../library/api'
import { openScene, resetCurrentScene } from '../../../../library/currentScene'
import { seededDesign } from '../../../home/startScene'
import { EMPTY_PLAN } from '../../../scene/design/useBuildSet'
import { DEVELOPED, PASTED, V2 } from '../../../scene/__tests__/developFixture'
import { fakeBrief, type FakeBrief } from '../../../scene/__tests__/briefFakes'
import { fakeApi, kitDeps, kitShot } from '../../../scene/__tests__/fakes'
import { castCard, freshGuided, propCard } from '../../../scene/design/guided'
import { freshDesign, markUnsynced, saveDesign, type Design } from '../../../scene/design/state'
import { SetupPanel } from '../../panels/SetupPanel'
import { StageSceneProvider, useStageScene, type StageScene } from '../StageScene'

const SCENE = 'sc-20261029010000-setp'
const lab = () => ({ kit: { id: null, world: null }, refreshShots: vi.fn(async () => [kitShot]), set: vi.fn() }) as unknown as ProjectionLabState

let brief: FakeBrief, bible: ReturnType<typeof fakeApi>, kit: ReturnType<typeof kitDeps>, jobs: SceneJobs
let seen: StageScene | null = null
function Peek() { seen = useStageScene(); return null }

beforeEach(() => {
  localStorage.clear(); seen = null
  brief = fakeBrief({ developed: DEVELOPED }); bible = fakeApi(); kit = kitDeps(); jobs = new SceneJobs(null)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 404 }))) // no project (no saved cast cards)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

const seed = (d: Design) => { saveDesign(d, SCENE); markUnsynced(SCENE) }
const ui = (children: React.ReactNode, worldId: string | null = null) => (
  <StageSceneProvider scene={SCENE} worldId={worldId} lab={lab()} deps={{ api: brief, bible: bible.api, jobs, buildKit: kit }}>
    <Peek />{children}
  </StageSceneProvider>
)
const press = async (id: string) => { await act(async () => { fireEvent.click(screen.getByTestId(id)) }) }

describe('The first prompt on the Stage', () => {
  it("is the scene words box: typing writes the words as they are, and no Develop press or price is offered", async () => {
    seed(seededDesign())
    render(ui(<SetupPanel />))
    const box = await screen.findByTestId('setup-brief-input') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: PASTED } })
    await waitFor(() => expect(seen!.x.s.d.brief).toBe(PASTED))
    expect(screen.queryByTestId('setup-develop-press')).toBeNull()
    expect(brief.develop).not.toHaveBeenCalled()
  })
})

/** the design Develop leaves: the words, the Guided people and props, no tile */
function developed(o: Partial<Design> = {}): Design {
  const g = freshGuided([castCard('Mara', 'person', 'a cook in a faded blue apron')])
  return { ...freshDesign(), brief: 'A small farmhouse kitchen at dawn. @mara lifts the copper kettle off the stove.', v2: V2,
    guided: { ...g, props: [propCard('Copper kettle', 'a dented copper kettle'), propCard('Wooden stool', 'a three-legged wooden stool')] }, ...o }
}

describe("A scene's starting world", () => {
  it('a scene read with no world gets an empty world once (free: no planner, no Bible words) and its set approved; a remount starts no second', async () => {
    const view = { id: SCENE, name: 'S', revision: 1, hidden: false, createdAt: 't', updatedAt: 't', worldId: null, worlds: [],
      summary: { id: SCENE, name: 'S', thumbnail: null, stage: 'brief', lastEdited: 't', hidden: false, revision: 1 }, facts: { setBuilt: false, briefChanged: false, takes: {} } }
    resetCurrentScene({ get: vi.fn(async () => view) } as unknown as LibraryApi); openScene(SCENE)
    seed(seededDesign())
    const r = render(ui(null))
    await waitFor(() => expect(bible.api.approveSet).toHaveBeenCalledTimes(1))
    expect(kit.create).toHaveBeenCalledTimes(1)
    expect(vi.mocked(kit.create).mock.calls[0][0].plan).toEqual(EMPTY_PLAN)
    expect(brief.plan).not.toHaveBeenCalled()
    expect(bible.api.save).not.toHaveBeenCalled()
    r.unmount(); render(ui(null))
    await act(async () => { await new Promise((k) => setTimeout(k, 50)) })
    expect(kit.create).toHaveBeenCalledTimes(1)
    resetCurrentScene()
  })
})

describe('Build the set from the Stage', () => {
  it('with words and no tiles it plans and builds: the Props list names the Develop props, the person without a look is no element and their @tag is said as a name', async () => {
    seed(developed())
    render(ui(<SetupPanel />))
    await waitFor(() => expect((screen.getByTestId('setup-build-press') as HTMLButtonElement).disabled).toBe(false))
    await press('setup-build-press')
    await waitFor(() => expect(bible.api.approveSet).toHaveBeenCalledTimes(1))
    expect(brief.plan).toHaveBeenCalledTimes(1)
    const sentence = brief.plan.mock.calls[0][0].prompts[0]
    expect(propsOf(sentence).map((p) => [p.tag, p.name])).toEqual([['kettle', 'Copper kettle'], ['stool', 'Wooden stool']])
    expect(sentenceOf(sentence)).toContain('Mara lifts the copper kettle')
    expect(bible.api.check.mock.invocationCallOrder[0]).toBeLessThan(brief.plan.mock.invocationCallOrder[0]) // free check first
    expect(kit.create).toHaveBeenCalledTimes(1)
    const sheet = bible.current()!
    expect(sheet.prompt).toBe('A small farmhouse kitchen at dawn. Mara lifts the copper kettle off the stove.')
    expect(sheet.elements).toEqual([]) // no person without a look, no prop without a tile
    expect(seen!.x.s.d.pieces).toEqual([]) // no Guided pick became a tile
  })

  it('refuses only empty words or a draft tile, said before the press', async () => {
    seed(developed({ brief: '' }))
    render(ui(<SetupPanel />))
    await waitFor(() => expect(screen.getByTestId('setup-build-why').textContent).toMatch(/Write the scene words first/))
    expect((screen.getByTestId('setup-build-press') as HTMLButtonElement).disabled).toBe(true)
    expect(brief.plan).not.toHaveBeenCalled()
  })

  it('a plan that lands after the Setup panel is gone (another screen) still builds the set and approves it', async () => {
    let release!: () => void
    const gate = new Promise<void>((k) => { release = k })
    const plan = brief.plan.getMockImplementation()!
    brief.plan.mockImplementation(async (r) => { await gate; return plan(r) })
    seed(developed())
    const r = render(ui(<SetupPanel />))
    await waitFor(() => expect((screen.getByTestId('setup-build-press') as HTMLButtonElement).disabled).toBe(false))
    await press('setup-build-press')
    await waitFor(() => expect(brief.plan).toHaveBeenCalledTimes(1))
    r.rerender(ui(null)) // the Render screen: no Setup panel, the provider stays
    expect(screen.queryByTestId('setup-panel')).toBeNull()
    await act(async () => { release() })
    await waitFor(() => expect(bible.api.approveSet).toHaveBeenCalledTimes(1))
    expect(kit.create).toHaveBeenCalledTimes(1)
  })
})

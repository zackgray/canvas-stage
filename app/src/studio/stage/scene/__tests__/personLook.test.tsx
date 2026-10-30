// @vitest-environment jsdom
// The person card (object card wave): the one dialog the picked person opens, through the Stage's one design copy, against one
// fake draft route (a revision, a stale write refused with 409, as the server does), a fake cast route, a fake sheet and a fake
// world. A new scene starts with NO card chosen and no look name (stale-cast-card); the maker defaults to ONE look; the long
// 'Rules every look follows' text is gone from the panel and the prompt — only the short 'no logos or printed text' line stays,
// editable under ADVANCED with Reset; the history of generations reopens with the card (the draft is the scene's own). Use this
// look: the tile approved, the Guided card used, its Cast card saved once, its sheet element with the card id, the performer named
// with no costume, the words tagged; a failure at any step keeps what came before and offers Try again. A click on a picture spends
// nothing. A drawer edit and a person pick never refuse each other. Nothing spends.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SceneJobs } from '../../../../jobs/sceneJobs'
import type { KitWorld } from '../../../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../../../labs/projection/useProjectionLab'
import type { DraftDesign } from '../../../../shared/sceneContract'
import { blank, fakeApi, WORLD } from '../../../scene/__tests__/fakes'
import { briefApi, DEFAULT_LOOK_RULES } from '../../../scene/briefApi'
import { castCard, freshGuided, type CastCard } from '../../../scene/design/guided'
import type { Piece } from '../../../scene/design/model'
import { freshDesign, type Design } from '../../../scene/design/state'
import { SAVE_MS } from '../../../scene/design/useDesign'
import { PersonCard } from '../../panels/PersonLook'
import { PromptDrawer, resetDrawerChoice } from '../../PromptDrawer'
import { setPieceBuildApi } from '../../pieceBuilding'
import { StageSceneProvider, type KitIo } from '../StageScene'

const SCENE = 'sc-test-person'
const DESC = 'a tall cook in a white apron and wooden clogs'
const CANDS = ['/lab-assets/cast/cook-a1/draft/cand-1.png', '/lab-assets/cast/cook-a1/draft/cand-2.png']
const BRIEF = 'A small kitchen at dawn. The cook lifts a kettle.'
const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
const LAB = { kit: { id: WORLD, world: null } } as unknown as ProjectionLabState

/** the draft, cast and project routes in memory */
function server(design: Design) {
  let rec = { design: design as unknown as DraftDesign, revision: 1, updatedAt: 't' }
  const refused: number[] = [], keeps: unknown[] = [], asked: Record<string, unknown>[] = []
  const o = { failKeep: false, gate: null as Promise<void> | null }
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {}
    if (url.startsWith('/__lab/scene/draft?project=')) return ok({ draft: rec })
    if (url === '/__lab/scene/draft' && init?.method === 'POST') {
      if (body.revision !== rec.revision) { refused.push(body.revision as number); return ok({ error: 'Another tab changed this scene.', revision: rec.revision }, 409) }
      rec = { design: body.design as DraftDesign, revision: rec.revision + 1, updatedAt: 't' }
      return ok({ draft: rec })
    }
    if (url === '/__lab/cast/candidates') {
      asked.push(body)
      if (o.gate) await o.gate
      return ok({ candidates: Array.from({ length: body.count as number }, (_, i) => `/lab-assets/cast/${body.cardId}/draft/cand-${i + 1}.png`) })
    }
    if (url === '/__lab/cast/keep') {
      keeps.push(body)
      if (o.failKeep) { o.failKeep = false; return ok({ error: 'the disk is full' }, 500) }
      return ok({ url: `/lab-assets/cast/${body.cardId}/kept/face-1.png` })
    }
    if (url.includes('/ingredient')) return ok({})
    return ok({ error: 'no' }, 404)
  })
  return { f, o, refused, keeps, asked, now: () => rec.design as unknown as Design }
}

function kit(perf: KitWorld['perf'] = { path: [[0, 0], [2, 0]] }) {
  let cur = perf
  const saved: KitWorld['perf'][] = []
  const io = {
    get: vi.fn(async (id: string) => ({ id, perf: cur }) as unknown as KitWorld),
    savePerf: vi.fn(async (id: string, p: KitWorld['perf']) => { saved.push(p); cur = p; return { id, perf: p } as unknown as KitWorld }),
  }
  return { io: io as unknown as KitIo & typeof io, saved }
}

const world = (castId?: string) => ({ id: WORLD, perf: { path: [[0, 0], [2, 0]], ...(castId ? { castId } : {}) } }) as unknown as KitWorld
const cook = (): CastCard => ({ ...castCard('Cook', 'person', DESC), cands: [...CANDS] })
const designWith = (c: CastCard, o: Partial<Design> = {}): Design => ({ ...freshDesign(), screen: 'board', phase: 'board', brief: BRIEF, guided: freshGuided([c]), pieces: [], ...o })

let srv: ReturnType<typeof server>
let jobs: SceneJobs
beforeEach(() => {
  resetDrawerChoice(); localStorage.clear()
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1080 })
  jobs = new SceneJobs(null)
  setPieceBuildApi({ get: vi.fn(async () => ({ price: 8, tiles: [], running: null, setChangedAt: null, stillStale: false })), build: vi.fn(), recover: vi.fn(), complete: vi.fn() })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 404 }))) // no project (no saved cast cards)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setPieceBuildApi(null); localStorage.clear() })

function mount(o: { w?: KitWorld | null; bible?: ReturnType<typeof fakeApi>; k?: ReturnType<typeof kit>; drawer?: boolean } = {}) {
  const bible = o.bible ?? fakeApi(), k = o.k ?? kit()
  const api = briefApi(srv.f as never, SCENE)
  const r = render(
    <StageSceneProvider scene={SCENE} worldId={WORLD} lab={LAB} deps={{ api, bible: bible.api, jobs, kit: k.io }}>
      <PersonCard world={o.w === undefined ? world() : o.w} onClose={() => {}} />
      {o.drawer && <PromptDrawer />}
    </StageSceneProvider>)
  return { bible, k, r }
}
const tile = (tag: string) => srv.now().pieces.find((p: Piece) => p.tag === tag)
const settle = () => act(() => new Promise((r) => setTimeout(r, SAVE_MS + 150)))
async function pickAndUse(_c: CastCard) {
  fireEvent.click(await screen.findByTestId('look-cand-1'))
  fireEvent.click(screen.getByTestId('look-use'))
}

describe('the person card, nobody yet', () => {
  it('no world: nothing renders', () => {
    srv = server(designWith(cook()))
    mount({ w: null })
    expect(screen.queryByTestId('object-card')).toBeNull()
  })

  it('a fresh scene starts with no card chosen and no look name; the maker defaults to one look and the rules box is gone from it', async () => {
    const c = castCard('', 'person', '') // nobody has a look or a name yet
    srv = server(designWith(c, { guided: { ...freshGuided([c]), counts: { cast: 2, props: 2 } } }))
    const bible = fakeApi({ ...blank(WORLD), elements: [] })
    mount({ bible })
    const name = await screen.findByTestId('card-name') as HTMLInputElement
    // (stale-cast-card) nothing is ticked or named on a fresh world: the card starts empty, no saved look shows
    expect(name.value).toBe('')
    expect(screen.getByTestId('look-nobody').textContent).toMatch(/Nobody plays the person yet/)
    const gen = await screen.findByTestId('look-generate') as HTMLButtonElement
    expect(gen.textContent).toContain('Generate looks')
    await waitFor(() => expect(gen.parentElement?.textContent).toContain('≈ 7 cr')) // ONE look by default (owner 2026-10-28)
    expect(gen.className).toContain('st-primary') // the one yellow press is the next thing to do
    expect(gen.disabled).toBe(true)
    expect(screen.getByTestId('look-why').textContent).toMatch(/name first/)
    expect(screen.queryByText(/Rules every look follows/)).toBeNull() // the long legal box is gone from the panel
    expect(screen.getByTestId('look-use').className).not.toContain('st-primary') // grey until a candidate is picked
    expect((screen.getByTestId('look-use') as HTMLButtonElement).disabled).toBe(true)
    // the history strip is empty: no stale saved look is shown or ticked
    expect(screen.queryByTestId('look-grid')).toBeNull()
    fireEvent.change(name, { target: { value: 'Cook' } })
    fireEvent.change(screen.getByTestId('look-desc'), { target: { value: 'short' } })
    expect(screen.getByTestId('look-why').textContent).toMatch(/sentence or more/)
  })

  it('ADVANCED: how the picture is taken, and only the short no-logos line — each Reset', async () => {
    const c = cook()
    srv = server(designWith(c))
    mount()
    await screen.findByTestId('card-name')
    fireEvent.click(screen.getByTestId('object-tab-advanced'))
    const framing = await screen.findByTestId('look-framing') as HTMLTextAreaElement
    expect(framing.value).toMatch(/^Full-length character reference photo/)
    expect((screen.getByTestId('look-framing-reset') as HTMLButtonElement).disabled).toBe(true)
    const rules = screen.getByTestId('look-rules') as HTMLTextAreaElement
    expect(rules.value).toBe(DEFAULT_LOOK_RULES) // the short line only; the long rules text is gone
    expect(rules.value).not.toMatch(/An original character/)
    fireEvent.change(rules, { target: { value: 'Plain work clothes only.' } })
    expect((screen.getByTestId('look-rules-reset') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByTestId('look-rules-reset'))
    expect((screen.getByTestId('look-rules') as HTMLTextAreaElement).value).toBe(DEFAULT_LOOK_RULES)
  })

  it('swap to a saved person names the performer (free)', async () => {
    const c = cook()
    srv = server(designWith(c))
    const baker = { id: 'baker-1', name: 'Baker', versions: [{ version: 1, created: 't', payload: { name: 'Baker', description: 'a baker in a straw hat', references: ['/k/baker.png'], sheets: [] } }] }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/__lab/project/') && url.endsWith('/bootstrap')) return ok({ project: { id: 'default', name: 'Default', revision: 1, created: 't', ingredients: { cast: [baker], looks: [], locations: [], props: [] }, shots: [] }, created: false })
      return srv.f(url, init)
    }))
    const { k } = mount()
    const swap = await screen.findByTestId('look-swap')
    expect(swap.textContent).toContain('Baker')
    fireEvent.change(swap, { target: { value: 'baker-1' } })
    await waitFor(() => expect(k.saved).toHaveLength(1))
    expect(k.saved[0]).toMatchObject({ castId: 'baker-1' })
  })
})

describe('Generate looks', () => {
  it('sends one look and only the short no-logos line; the edited line rides as written; clearing it drops the line', async () => {
    const c = castCard('Cook', 'person', DESC) // nothing drawn yet: the maker defaults to ONE look
    srv = server(designWith(c))
    mount()
    fireEvent.change(await screen.findByTestId('card-name'), { target: { value: 'Cook' } })
    fireEvent.click(await screen.findByTestId('look-generate'))
    await waitFor(() => expect(srv.asked).toHaveLength(1))
    expect(srv.asked[0]).toMatchObject({ count: 1, description: DESC })
    expect(srv.asked[0]).not.toHaveProperty('framing')
    expect(srv.asked[0].rules).toBe(DEFAULT_LOOK_RULES)
    await waitFor(() => expect((screen.getByTestId('look-generate') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('object-tab-advanced'))
    fireEvent.change(await screen.findByTestId('look-rules'), { target: { value: 'Plain work clothes only.' } })
    fireEvent.click(screen.getByTestId('object-tab-look'))
    fireEvent.click(screen.getByTestId('look-generate'))
    await waitFor(() => expect(srv.asked).toHaveLength(2))
    expect(srv.asked[1]).toMatchObject({ rules: 'Plain work clothes only.', description: DESC })
    expect(srv.asked[1]).not.toHaveProperty('framing')
    fireEvent.click(screen.getByTestId('object-tab-advanced'))
    fireEvent.change(screen.getByTestId('look-rules'), { target: { value: '' } }) // removable under Advanced
    fireEvent.click(screen.getByTestId('object-tab-look'))
    fireEvent.click(screen.getByTestId('look-generate'))
    await waitFor(() => expect(srv.asked).toHaveLength(3))
    expect(srv.asked[2].rules).toBe('')
  })

  it('typing and clicking pictures spend nothing; a double press is one job; the history reopens with the card', async () => {
    const c = castCard('Cook', 'person', DESC) // nothing drawn yet: the maker defaults to ONE look
    srv = server(designWith(c))
    mount()
    fireEvent.change(await screen.findByTestId('card-name'), { target: { value: 'Cook' } })
    const gen = await screen.findByTestId('look-generate')
    fireEvent.change(screen.getByTestId('look-desc'), { target: { value: `${DESC}, now with a scarf` } })
    await settle()
    expect(srv.asked).toHaveLength(0) // typing spent nothing
    await act(async () => { fireEvent.click(gen); fireEvent.click(gen) })
    await waitFor(() => expect(srv.asked).toHaveLength(1))
    await settle()
    expect(srv.asked).toHaveLength(1)
    // the drawn look lands in the card itself, newest first, labelled
    await waitFor(() => expect(screen.getByTestId('look-cand-0')).toBeTruthy())
    expect(screen.getByTestId('look-grid').textContent).toContain('1') // labelled strip
    expect(screen.queryByTestId('look-cand-1')).toBeNull() // one look was drawn
    // closing and reopening the card reopens the history (the draft is the scene's own; nothing is lost)
    cleanup()
    mount()
    await waitFor(() => expect(screen.getByTestId('look-cand-0')).toBeTruthy())
    expect(screen.queryByTestId('look-cand-1')).toBeNull()
  })
})

describe('Use this look', () => {
  it('the whole chain: tile approved, card used, Cast card saved once, element with the card id, the performer with no costume, the words tagged', async () => {
    const c = cook()
    srv = server(designWith(c))
    const { bible, k } = mount()
    await pickAndUse(c)
    await waitFor(() => expect(k.saved).toHaveLength(1))
    expect(srv.keeps).toHaveLength(1) // the card saved once (the design's own saver and the press share it)
    const el = bible.current()!.elements.find((e) => e.tag === 'cook')!
    expect(el).toMatchObject({ kind: 'cast', refs: [CANDS[1]], cardId: expect.stringMatching(/^cook-/) })
    expect(k.saved[0]).toEqual({ path: [[0, 0], [2, 0]], castId: el.cardId }) // no costume
    await settle()
    expect(tile('cook')).toMatchObject({ type: 'person', state: 'approved', onBoard: true, looks: [CANDS[1]], cardId: el.cardId, line: DESC })
    expect(srv.now().guided!.cast[0].fixed).toEqual({ tag: 'cook', look: CANDS[1], cardId: el.cardId })
    expect(srv.now().guided!.cast[0].cands).toEqual(CANDS) // the paid looks stay
    expect(srv.now().brief).toBe('A small kitchen at dawn. @cook lifts a kettle.')
    expect(srv.refused).toEqual([])
  })

  it('someone already plays the subject: a new person is made and the performer stays', async () => {
    const c = cook()
    srv = server(designWith(c))
    const k = kit({ path: [[0, 0], [2, 0]], castId: 'baker-1' } as KitWorld['perf'])
    const { bible } = mount({ w: world('baker-1'), k })
    await pickAndUse(c)
    await waitFor(() => expect(bible.current()?.elements.some((e) => e.tag === 'cook')).toBe(true))
    await settle()
    expect(k.saved).toEqual([])
  })

  it.each([
    ['tag', /Reading the tags/],
    ['card', /Saving their Cast card/],
    ['element', /Writing them into the scene sheet/],
    ['performer', /Making them play the subject/],
  ] as const)('a failure at the %s step keeps the steps before it, says which, and Try again finishes', async (step, says) => {
    const c = cook()
    srv = server(designWith(c))
    const bible = fakeApi(), k = kit()
    mount({ bible, k })
    await waitFor(() => expect(bible.api.get).toHaveBeenCalled()) // the card's own read of the sheet
    if (step === 'tag') bible.api.get.mockRejectedValueOnce(new Error('the sheet is not answering'))
    if (step === 'card') srv.o.failKeep = true
    if (step === 'element') bible.api.putElement.mockRejectedValueOnce(new Error('the sheet is not answering'))
    if (step === 'performer') k.io.get.mockRejectedValueOnce(new Error('the world is not answering'))
    await pickAndUse(c)
    const err = await screen.findByTestId('look-use-error')
    expect(err.textContent).toMatch(says)
    expect(err.textContent).toMatch(/looks are kept/)
    await settle()
    const after = srv.now()
    expect(after.guided!.cast[0].cands).toEqual(CANDS)
    if (step === 'tag') expect(after.pieces).toEqual([])
    else expect(tile('cook')).toMatchObject({ state: 'approved', looks: [CANDS[1]] })
    if (step === 'element' || step === 'performer') expect(tile('cook')?.cardId).toBeTruthy()
    if (step === 'performer') expect(bible.current()!.elements.some((e) => e.tag === 'cook')).toBe(true)
    expect(k.saved).toEqual([])
    await waitFor(() => expect(screen.getByTestId('look-retry')).toBeTruthy())
    fireEvent.click(screen.getByTestId('look-retry')) // Dismiss; Try again runs the whole chain again from the maker
    await waitFor(() => expect(k.saved).toHaveLength(1))
    expect(screen.queryByTestId('look-use-error')).toBeNull()
    expect(srv.keeps).toHaveLength(step === 'card' ? 2 : 1) // a refused save is tried again; a saved card never twice
    await settle()
    expect(srv.now().pieces.filter((p: Piece) => p.tag === 'cook')).toHaveLength(1)
    expect(srv.now().brief).toBe('A small kitchen at dawn. @cook lifts a kettle.')
  })

  it('one design copy: a drawer edit and a person pick against one draft never refuse each other', async () => {
    const c = cook()
    srv = server(designWith(c))
    const { k } = mount({ drawer: true })
    await screen.findByTestId('stage-brief-card')
    if (!screen.queryByTestId('stage-brief-input')) fireEvent.click(screen.getByTestId('stage-brief-view'))
    fireEvent.change(screen.getByTestId('stage-brief-input'), { target: { value: `${BRIEF} Steam rises.` } })
    await pickAndUse(c) // inside the drawer's pause
    await waitFor(() => expect(k.saved).toHaveLength(1))
    await settle()
    await settle()
    expect(srv.refused).toEqual([])
    expect(srv.now().brief).toBe('A small kitchen at dawn. @cook lifts a kettle. Steam rises.')
    expect(tile('cook')?.state).toBe('approved')
  })
})

describe('Generate looks is a job of the scene', () => {
  it('an answer that lands after the card went away is put on the card when the Stage is back (the job consumer)', async () => {
    const c: CastCard = { ...castCard('Cook', 'person', DESC) }
    srv = server(designWith(c))
    let open!: () => void
    srv.o.gate = new Promise<void>((r) => { open = r })
    const first = mount()
    fireEvent.change(await screen.findByTestId('card-name'), { target: { value: 'Cook' } })
    fireEvent.click(screen.getByLabelText('More looks')) // two looks this draw
    fireEvent.click(await screen.findByTestId('look-generate'))
    await waitFor(() => expect(srv.asked).toHaveLength(1))
    expect(srv.asked[0]).toMatchObject({ count: 2 })
    first.r.unmount() // the Stage left mid-draw (the draft's pending write goes out as the page leaves)
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    mount()
    await act(async () => { open(); await new Promise((r) => setTimeout(r, 30)) })
    await waitFor(() => expect(screen.getByTestId('look-cand-0')).toBeTruthy())
    await settle()
    expect(srv.now().guided!.cast[0].cands).toEqual([1, 2].map((i) => `/lab-assets/cast/${srv.asked[0].cardId}/draft/cand-${i}.png`))
  })
})

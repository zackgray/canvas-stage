// @vitest-environment jsdom
// The Prompt drawer edits the take on show (drawer-edits-the-take, owner 10-29): with a take on show the drawer's one box is that
// take's words, named in its head; another take on show puts its words in the box, and words typed in one take are never written to
// another, however fast the switch; an edit there writes the take only (the take-words route, the page told, so its first frame is
// judged again), never the scene prompt. One prompt (owner 10-29): the box is labelled "Prompt" in every mode, the take named under it,
// and no "Scene prompt" is ever said; before the world has a take it is the words every take starts from (the scene prompt underneath);
// with takes and none on show (a take being filmed) it shows, read-only, the words the next take starts from: the take last on show,
// else the newest. Fake servers, nothing paid.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import type { DraftDesign } from '../../../shared/sceneContract'
import { TAKE_WORDS_CHANGED, type TakeBoardRow } from '../../../shared/takeWordsContract'
import type { BriefApi } from '../../scene/briefApi'
import { mkPiece } from '../../scene/design/model'
import { freshDesign, type Design } from '../../scene/design/state'
import { SAVE_MS } from '../../scene/design/useDesign'
import { fakeApi, WORLD } from '../../scene/__tests__/fakes'
import { resetL2RStore } from '../../render/l2rStore'
import { resetCurrentTake, setCurrentTake, setMemoryTakeLocked } from '../../shoot/currentTake'
import { resetLastTake } from '../../shoot/lastTake'
import { resetTakeBoard } from '../../shoot/takeBoard'
import { resetLockedTakes } from '../../shoot/worldTakes'
import { PromptDrawer, resetDrawerChoice } from '../PromptDrawer'
import { StageSceneProvider } from '../scene/StageScene'
import { takeWordsSettled } from '../useTakeWordsSave'

const SCENE = 'sc-test-drawer-take'
const BRIEF = 'A pier at dusk. @maker waits.'
const A = 'take-2026-10-29T10-00-00-000'
const B = 'take-2026-10-29T10-05-00-000'
const draft = (): Design => ({ ...freshDesign(), screen: 'board', phase: 'board', brief: BRIEF, v2: null, pieces: [mkPiece('maker', 'Maker', 'person', { onBoard: true })] })
const io = () => ({
  loadDraft: vi.fn(async () => draft() as unknown as DraftDesign), saveDraft: vi.fn(async () => {}),
  uploadReference: vi.fn(async () => '/x.png'), status: vi.fn(async () => { throw new Error('no planner here') }),
}) as unknown as BriefApi & { saveDraft: ReturnType<typeof vi.fn> }

let rows: Record<string, TakeBoardRow>
let slow = 0 // ms the words route takes to answer
let posts: { takeId: string; prompt?: string }[]
let calls: string[]
let noTakes = false
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })
beforeEach(() => {
  resetDrawerChoice(); Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1080 })
  posts = []; calls = []; slow = 0; noTakes = false; resetLastTake()
  const row = (id: string, words: string, name: string | null): TakeBoardRow => ({ id, name, thumb: null, state: 'locked', words, own: true, sceneChanged: false })
  rows = { [A]: row(A, 'Take A: @maker on the pier.', null), [B]: row(B, 'Take B: a wide of the harbour.', 'Wide') }
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const p = String(url).split('?')[0]
    calls.push(`${init?.method ?? 'GET'} ${p}`)
    if (p === '/__lab/takes/board') return json({ rows: noTakes ? [] : [rows[B], rows[A]], scenePrompt: BRIEF })
    if (p === '/__lab/takes/words') {
      const b = JSON.parse(String(init!.body)); posts.push(b)
      if (slow) await new Promise((r) => setTimeout(r, slow))
      rows[b.takeId] = { ...rows[b.takeId], words: b.prompt }
      return json({ take: { id: b.takeId } })
    }
    if (p === '/__lab/takes/sources') return json({ sources: [] })
    if (p === '/__lab/takes') return json({ takes: [] })
    return new Response('null', { status: 404 })
  }))
  resetCurrentTake(); resetTakeBoard(); resetLockedTakes(); resetL2RStore()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetLastTake(); resetTakeBoard(); resetLockedTakes(); resetL2RStore(); localStorage.clear() })

function mount(lab?: ProjectionLabState) {
  const brief = io(), bible = fakeApi().api
  render(<StageSceneProvider scene={SCENE} worldId={WORLD} lab={{ kit: { id: null, world: null } } as unknown as ProjectionLabState} deps={{ api: brief, bible }}>
    <PromptDrawer lab={lab} /></StageSceneProvider>)
  return { brief, bible }
}
const label = () => screen.getByTestId('drawer-mode-label').textContent
const takeName = () => screen.getByTestId('drawer-take-name').textContent
const noSceneWords = () => expect(screen.getByTestId('prompt-drawer').textContent).not.toMatch(/scene prompt|update from scene/i)
const takeBox = () => screen.findByTestId('take-words-input') as Promise<HTMLTextAreaElement>
const noPaid = () => expect(calls.filter((c) => c.startsWith('POST') && !c.includes('/takes/words') && !c.includes('/project/bootstrap'))).toEqual([])

describe('the Prompt drawer follows the take on show', () => {
  it('before the world has a take its one box is the words every take starts from, labelled Prompt', async () => {
    noTakes = true
    mount()
    expect(await screen.findByTestId('stage-brief-card')).toBeTruthy()
    expect(label()).toBe('Prompt')
    expect(screen.queryByTestId('take-words')).toBeNull()
    expect(screen.queryByTestId('drawer-mode-switch')).toBeNull()
    expect(screen.queryByTestId('drawer-take-name')).toBeNull()
    noSceneWords()
  })

  it("with takes and none on show it shows, read-only, the newest take's words (what the next take starts from)", async () => {
    mount()
    const seed = await screen.findByTestId('drawer-seed-words') as HTMLTextAreaElement
    await waitFor(() => expect(seed.value).toBe('Take B: a wide of the harbour.'))
    expect(seed.readOnly).toBe(true)
    expect(label()).toBe('Prompt')
    expect(screen.queryByTestId('stage-brief-card')).toBeNull()
    noSceneWords()
  })

  it("with a take on show its one box is that take's words, named in the head; the scene box is not there", async () => {
    setCurrentTake(A)
    mount()
    expect((await takeBox()).value).toBe('Take A: @maker on the pier.')
    expect(label()).toBe('Prompt')
    expect(takeName()).toMatch(/^Take · /)
    expect(screen.queryByTestId('stage-brief-card')).toBeNull()
    noSceneWords()
  })

  it("another take on show repopulates the box; a named take's head carries its name", async () => {
    setCurrentTake(A)
    mount()
    expect((await takeBox()).value).toBe('Take A: @maker on the pier.')
    act(() => setCurrentTake(B, true))
    await waitFor(async () => expect((await takeBox()).value).toBe('Take B: a wide of the harbour.'))
    expect(label()).toBe('Prompt')
    expect(takeName()).toBe('Wide')
    expect(posts).toEqual([])
  })

  it("words typed in one take go to that take only, however fast the switch; the next take's box shows its own words", async () => {
    setCurrentTake(A)
    mount()
    const a = await takeBox()
    fireEvent.focus(a)
    fireEvent.change(a, { target: { value: 'Take A, rewritten.' } })
    act(() => setCurrentTake(B, true)) // no blur, no pause: the box goes away with the words unsaved
    act(() => setCurrentTake(A, true))
    act(() => setCurrentTake(B, true))
    await waitFor(async () => expect((await takeBox()).value).toBe('Take B: a wide of the harbour.'))
    await act(async () => { await takeWordsSettled() })
    expect(posts).toEqual([{ takeId: A, prompt: 'Take A, rewritten.' }])
    expect(rows[B].words).toBe('Take B: a wide of the harbour.')
    act(() => setCurrentTake(A, true))
    await waitFor(async () => expect((await takeBox()).value).toBe('Take A, rewritten.'))
  })

  it('back on a take whose words are still being written: the box waits read-only, then shows them (typing never starts from older words)', async () => {
    slow = 150
    setCurrentTake(A)
    mount()
    const a = await takeBox()
    fireEvent.focus(a)
    fireEvent.change(a, { target: { value: 'Take A, slow write.' } })
    act(() => setCurrentTake(B, true))
    await waitFor(async () => expect((await takeBox()).value).toBe('Take B: a wide of the harbour.'))
    act(() => setCurrentTake(A, true))
    const back = await takeBox()
    expect(back.readOnly).toBe(true)
    await waitFor(async () => { const x = await takeBox(); expect(x.value).toBe('Take A, slow write.'); expect(x.readOnly).toBe(false) })
    expect(posts).toEqual([{ takeId: A, prompt: 'Take A, slow write.' }])
  })

  it('an edit in take mode saves at a pause, writes that take only and tells the page; the scene prompt is untouched', async () => {
    const told = vi.fn()
    window.addEventListener(TAKE_WORDS_CHANGED, told)
    setCurrentTake(A)
    const { brief, bible } = mount()
    const a = await takeBox()
    await new Promise((r) => setTimeout(r, SAVE_MS + 150)) // the scene draft's first read settles
    brief.saveDraft.mockClear(); bible.save.mockClear()
    fireEvent.focus(a)
    fireEvent.change(a, { target: { value: 'Take A: @maker close.' } })
    await waitFor(() => expect(posts).toEqual([{ takeId: A, prompt: 'Take A: @maker close.' }]), { timeout: SAVE_MS + 1000 })
    await waitFor(() => expect(told).toHaveBeenCalledWith(expect.objectContaining({ detail: A })))
    fireEvent.blur(a) // nothing new to write
    await new Promise((r) => setTimeout(r, SAVE_MS + 150))
    expect(posts).toHaveLength(1)
    expect(rows[B].words).toBe('Take B: a wide of the harbour.')
    expect(bible.save).not.toHaveBeenCalled()
    expect(brief.saveDraft).not.toHaveBeenCalled()
    window.removeEventListener(TAKE_WORDS_CHANGED, told)
    noPaid()
  })

  it('no "Scene prompt" switch or wording in any mode; the take last on show is what a filmed, unlocked take starts from', async () => {
    setCurrentTake(A)
    const lab = { op: { engine: { deck: { recording: false, take: null } } }, s: { source: WORLD }, kit: { id: WORLD, world: null } } as unknown as ProjectionLabState // the take card beside the box reads the render and the set
    const deck = (lab as unknown as { op: { engine: { deck: { recording: boolean } } } }).op.engine.deck
    mount(lab)
    await takeBox()
    expect(screen.queryByTestId('drawer-mode-switch')).toBeNull()
    noSceneWords()
    // filming a new take: the lock clears the take on show; the box shows take A's words (the take last on show), read-only
    act(() => { deck.recording = true; setCurrentTake(null) })
    const seed = await screen.findByTestId('drawer-seed-words') as HTMLTextAreaElement
    await waitFor(() => expect(seed.value).toBe('Take A: @maker on the pier.'))
    expect(seed.readOnly).toBe(true)
    await waitFor(() => expect(screen.getByTestId('drawer-seed-note').textContent).toMatch(/once you lock it/)) // the engine is polled
    expect(label()).toBe('Prompt')
    noSceneWords()
    expect(posts).toEqual([])
  })

  it('a take being filmed (not locked yet) shows the words it will start from, never the box of the take that was on show', async () => {
    setCurrentTake(A); setMemoryTakeLocked(false)
    const lab = { op: { engine: { deck: { recording: true, take: null } } }, s: { source: WORLD }, kit: { id: WORLD, world: null } } as unknown as ProjectionLabState // the take card beside the box reads the render and the set
    mount(lab)
    expect((await screen.findByTestId('drawer-seed-words') as HTMLTextAreaElement).value).toBe('Take A: @maker on the pier.')
    expect(label()).toBe('Prompt')
    expect(screen.queryByTestId('take-words')).toBeNull()
  })

  it("folded, the line names the take and shows its words with @chips", async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 })
    setCurrentTake(A)
    mount()
    await waitFor(() => expect(screen.getByTestId('drawer-take-text').textContent).toBe('Take A: @maker on the pier.'))
    expect(label()).toBe('Prompt ▸')
    expect(takeName()).toMatch(/^Take · /)
    expect(screen.getByTestId('drawer-take-text').querySelector('.sd-chip')?.textContent).toBe('@maker')
  })
})

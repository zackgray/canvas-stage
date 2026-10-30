// @vitest-environment jsdom
// The words boxes, scene drawer and the take's own (tag-from-pasted-prompt, take-list-loose-ends): the quiet @ hint in both; the
// "Make this a character / prop" pop-up turns selected words into an @tag chip and opens its card, free (no paid route is called);
// the take's box gets the scene's @ pick-list; tags the scene lacks are said before any press; "write words first" reads the take's
// words; the Edit-this-frame strip re-reads at once after a take's words change. Fake servers, nothing paid.
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DraftDesign } from '../../../shared/sceneContract'
import { TAKE_WORDS_CHANGED, type TakeBoardRow } from '../../../shared/takeWordsContract'
import type { BriefApi } from '../../scene/briefApi'
import { mkPiece } from '../../scene/design/model'
import { freshDesign, type Design } from '../../scene/design/state'
import { fakeApi, WORLD } from '../../scene/__tests__/fakes'
import { resetL2RStore } from '../../render/l2rStore'
import { resetCurrentTake, setCurrentTake } from '../../shoot/currentTake'
import { resetTakeBoard } from '../../shoot/takeBoard'
import { resetLockedTakes } from '../../shoot/worldTakes'
import { base, serve, still } from '../../shoot/__tests__/heroStillHarness'
import { Drawer, resetDrawerChoice } from '../PromptDrawer'
import { useFrameEdit } from '../useFrameEdit'
import { useWordsFact } from '../useWordsFact'

const SCENE = 'sc-test-words'
const TAKE = 'take-2026-10-28T10-00-00-000'
const draftOf = (brief: string): Design => ({ ...freshDesign(), screen: 'board', phase: 'board', brief, v2: null, pieces: [mkPiece('maker', 'Maker', 'person', { onBoard: true })] })
const io = (brief: string) => ({
  loadDraft: vi.fn(async () => draftOf(brief) as unknown as DraftDesign), saveDraft: vi.fn(async () => {}),
  uploadReference: vi.fn(async () => '/x.png'), status: vi.fn(async () => { throw new Error('no planner here') }),
}) as unknown as BriefApi

let row: TakeBoardRow
let noTakes = false // the scene box is the drawer's only before the world has a take (one-prompt)
let calls: string[]
let posts: { prompt?: string }[]
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })
function serveBoard() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const p = String(url).split('?')[0]
    calls.push(`${init?.method ?? 'GET'} ${p}`)
    if (p === '/__lab/takes/board') return json({ rows: noTakes ? [] : [row], scenePrompt: 'A pier.' })
    if (p === '/__lab/takes/words') { const b = JSON.parse(String(init!.body)); posts.push(b); row = { ...row, words: b.prompt }; return json({ take: { id: TAKE } }) }
    if (p === '/__lab/takes/sources') return json({ sources: [] })
    if (p === '/__lab/takes') return json({ takes: [] })
    return new Response('null', { status: 404 })
  }))
}
beforeEach(() => {
  resetDrawerChoice(); Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1080 })
  calls = []; posts = []; noTakes = false
  row = { id: TAKE, name: null, thumb: null, state: 'locked', words: 'A pier at dusk.', own: true, sceneChanged: false }
  resetCurrentTake(); resetTakeBoard(); resetLockedTakes(); resetL2RStore()
  serveBoard()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetTakeBoard(); resetLockedTakes(); resetL2RStore(); localStorage.clear() })

const mount = (brief: string) => render(<Drawer scene={SCENE} worldId={WORLD} deps={{ api: io(brief), bible: fakeApi().api }} />)
const select = (box: HTMLTextAreaElement, word: string) => {
  const at = box.value.indexOf(word)
  box.focus(); box.setSelectionRange(at, at + word.length)
  fireEvent.select(box); fireEvent.mouseUp(box) // React reads a selection from the mouse-up
}
const noPaid = () => expect(calls.filter((c) => c.startsWith('POST') && !c.includes('/takes/words') && !c.includes('/project/bootstrap'))).toEqual([])

describe('the scene words box', () => {
  beforeEach(() => { noTakes = true })
  it('selected words offer Make this a character / prop; the press tags them, makes a draft tile and opens its card, free', async () => {
    mount('A pier at dusk. The old keeper waits.')
    fireEvent.click(await screen.findByTestId('stage-brief-view'))
    const box = await screen.findByTestId('stage-brief-input') as HTMLTextAreaElement
    expect(screen.queryByTestId('selection-tag-pop')).toBeNull()
    select(box, 'The old keeper')
    expect(await screen.findByTestId('selection-tag-pop')).toBeTruthy()
    fireEvent.click(screen.getByTestId('make-person'))
    await waitFor(() => expect((screen.getByTestId('stage-brief-input') as HTMLTextAreaElement).value).toBe('A pier at dusk. The @old-keeper waits.'))
    await screen.findByTestId('chip-pop-old-keeper') // its card: a new draft, nothing drawn yet
    expect(screen.getByTestId('chip-pop-old-keeper').textContent).toMatch(/Person · draft, not drawn yet/)
    noPaid()
  })

  it('a prop selection makes a prop tile', async () => {
    mount('A pier at dusk. A rusty lantern hangs.')
    fireEvent.click(await screen.findByTestId('stage-brief-view'))
    select(await screen.findByTestId('stage-brief-input') as HTMLTextAreaElement, 'rusty lantern')
    fireEvent.click(await screen.findByTestId('make-prop'))
    const pop = await screen.findByTestId('chip-pop-rusty-lantern')
    expect(pop.textContent).toMatch(/Prop · draft/)
    noPaid()
  })

  it('the box is a multi-line box that grows (the words drawer is the one place the scene words live)', async () => {
    mount('A pier at dusk.')
    fireEvent.click(await screen.findByTestId('stage-brief-view'))
    const box = await screen.findByTestId('stage-brief-input') as HTMLTextAreaElement
    Object.defineProperty(box, 'scrollHeight', { configurable: true, value: 222 })
    fireEvent.change(box, { target: { value: 'A pier at dusk.\n\nA second paragraph.' } })
    await waitFor(() => expect(box.style.height).toBe('222px'))
  })
})

describe("the take's own words box", () => {
  const withTake = async (words: string) => {
    row = { ...row, words }; setCurrentTake(TAKE)
    mount('A pier at dusk. @maker waits.')
    return await screen.findByTestId('take-words-input') as HTMLTextAreaElement
  }

  it('the take box is a multi-line box that grows too', async () => {
    const box = await withTake('A pier at dusk.')
    Object.defineProperty(box, 'scrollHeight', { configurable: true, value: 180 })
    fireEvent.focus(box)
    fireEvent.change(box, { target: { value: 'A pier at dusk.\n\nMore words.' } })
    await waitFor(() => expect(box.style.height).toBe('180px'))
  })

  it('hints at @ while its words hold no tag, and says nothing once they do', async () => {
    await withTake('A pier at dusk.')
    expect(screen.getAllByTestId('no-tag-hint')).toHaveLength(1) // the take's; the scene words carry @maker
    cleanup(); resetTakeBoard(); resetDrawerChoice(); await withTake('A pier. @maker waits.')
    expect(screen.queryByTestId('no-tag-hint')).toBeNull()
  })

  it("gets the scene drawer's @ pick-list: picking a tile puts its tag in; saved when the box is left", async () => {
    const box = await withTake('A pier at dusk. ')
    fireEvent.focus(box)
    fireEvent.change(box, { target: { value: 'A pier at dusk. @ma', selectionStart: 19, selectionEnd: 19 } })
    box.setSelectionRange(19, 19); fireEvent.select(box)
    fireEvent.mouseDown(await screen.findByTestId('at-maker'))
    await waitFor(() => expect(box.value).toBe('A pier at dusk. @maker '))
    fireEvent.blur(box)
    await waitFor(() => expect(posts).toEqual([{ takeId: TAKE, prompt: 'A pier at dusk. @maker ' }]))
  })

  it('words copied from another scene that name tags this scene lacks say so in the box, before any press', async () => {
    await withTake('@old-man walks the pier with @maker.')
    const note = await screen.findByTestId('unknown-tags-note')
    expect(note.textContent).toMatch(/^@old-man is not in this scene/)
    expect(note.textContent).not.toMatch(/@maker/)
    noPaid()
    expect(posts).toEqual([])
  })

  it("selected words make a tag in the take's words only, save at once, and open the card", async () => {
    const box = await withTake('The old keeper waits. @maker too.')
    fireEvent.focus(box)
    select(box, 'old keeper')
    fireEvent.click(await screen.findByTestId('make-person'))
    await waitFor(() => expect(posts).toEqual([{ takeId: TAKE, prompt: 'The @old-keeper waits. @maker too.' }]))
    await screen.findByTestId('chip-pop-old-keeper')
    noPaid()
  })
})

describe('write the words first reads the take', () => {
  const hook = (scene: string | null) => renderHook(() => useWordsFact(scene, 'loc-1'))
  it("with a take on show its words count, not the scene's", async () => {
    setCurrentTake(TAKE); row = { ...row, words: '  ' }
    const h = hook('A scene with words.')
    await waitFor(() => expect(calls).toContain('GET /__lab/takes/board'))
    await waitFor(() => expect(h.result.current).toBe(false)) // the take's words are empty though the scene has words
    cleanup(); resetTakeBoard(); row = { ...row, words: 'Now it has words.' }
    const h2 = hook('')
    await waitFor(() => expect(h2.result.current).toBe(true)) // the take's words stand in for an empty scene
  })
  it('with no take, or no design read yet, the old rules stand', () => {
    expect(hook('words').result.current).toBe(true)
    expect(hook('  ').result.current).toBe(false)
    expect(hook(null).result.current).toBe(true)
  })
})

describe('Edit this frame re-checks at once', () => {
  it('a take-words change reads the stills again without waiting for the next tick', async () => {
    resetCurrentTake(); setCurrentTake('take-1')
    const s = base({ stills: [still('hero-1', { approved: true })] }); serve(s)
    renderHook(() => useFrameEdit())
    const reads = () => s.calls.filter((c) => c.startsWith('GET /__lab/hero')).length
    await waitFor(() => expect(reads()).toBeGreaterThan(0))
    await new Promise((r) => setTimeout(r, 150)) // the first reads settle
    const before = reads()
    act(() => { window.dispatchEvent(new CustomEvent(TAKE_WORDS_CHANGED, { detail: 'take-1' })) })
    await waitFor(() => expect(reads()).toBeGreaterThan(before))
  })
})

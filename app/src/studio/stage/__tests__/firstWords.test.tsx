// @vitest-environment jsdom
// The first words (owner 10-29: no first-words card). A scene with no words yet lands on the Stage with the Prompt box open and
// focused, its short placeholder showing, no dimmed card and no Continue, whatever the window height; a scene with words keeps the
// owner's open/closed choice. Typing writes the scene's words once per pause in the typing (it was one write per keystroke), and a
// pause still running is written when focus leaves the box or the page is hidden. The scene is named from its first words (pure).
// Fake servers, nothing paid.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DraftDesign } from '../../../shared/sceneContract'
import type { BriefApi } from '../../scene/briefApi'
import { freshDesign, type Design } from '../../scene/design/state'
import { SAVE_MS } from '../../scene/design/useDesign'
import { fakeApi, WORLD } from '../../scene/__tests__/fakes'
import { resetCurrentTake } from '../../shoot/currentTake'
import { resetLastTake } from '../../shoot/lastTake'
import { resetTakeBoard } from '../../shoot/takeBoard'
import { Drawer, PROMPT_PLACEHOLDER, resetDrawerChoice } from '../PromptDrawer'
import { nameFromWords } from '../firstWordsState'

const SCENE = 'sc-20261029040000-firs'
const WORDS = 'A small farmhouse kitchen at dawn. Mara lifts the copper kettle off the stove.'
const draftOf = (brief: string): Design => ({ ...freshDesign(), screen: 'board', phase: 'board', brief, v2: null, pieces: [] })
const io = (brief: string) => ({
  loadDraft: vi.fn(async () => draftOf(brief) as unknown as DraftDesign), saveDraft: vi.fn(async () => {}),
  uploadReference: vi.fn(async () => '/x.png'), status: vi.fn(async () => { throw new Error('no planner here') }),
}) as unknown as BriefApi

const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })
let calls: string[]
beforeEach(() => {
  resetDrawerChoice(); resetCurrentTake(); resetLastTake(); resetTakeBoard(); calls = []
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 }) // under the fold height: arrival opens it anyway
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const p = String(url).split('?')[0]
    calls.push(`${init?.method ?? 'GET'} ${p}`)
    if (p === '/__lab/takes/board') return json({ rows: [], scenePrompt: '' })
    return new Response('null', { status: 404 })
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetTakeBoard(); localStorage.clear() })

const mount = (brief: string) => {
  const bible = fakeApi()
  render(<Drawer scene={SCENE} worldId={WORLD} deps={{ api: io(brief), bible: bible.api }} />)
  return bible
}
const box = () => screen.findByTestId('stage-brief-input') as Promise<HTMLTextAreaElement>
const paid = () => calls.filter((c) => c.startsWith('POST') && !c.includes('/project/bootstrap'))

describe('a new scene lands on the Stage ready to type', () => {
  it('opens the Prompt box focused with its short placeholder; no card, no dim, no Continue', async () => {
    mount('')
    const b = await box()
    await waitFor(() => expect(document.activeElement).toBe(b))
    expect(b.getAttribute('placeholder')).toBe(PROMPT_PLACEHOLDER)
    expect(screen.getByTestId('drawer-mode-label').textContent).toBe('Prompt')
    expect(screen.queryByTestId('first-words')).toBeNull()
    expect(screen.queryByTestId('first-words-dim')).toBeNull()
    expect(screen.queryByTestId('first-words-continue')).toBeNull()
    expect(document.body.textContent).not.toMatch(/Continue|Describe your scene/)
    expect(paid()).toEqual([])
  })

  it('a scene with words keeps the drawer as the owner left it (folded under the fold height), nothing focused', async () => {
    mount(WORDS)
    expect(await screen.findByTestId('drawer-line')).toBeTruthy()
    expect(screen.queryByTestId('stage-brief-input')).toBeNull()
  })

  it('typing writes the words once per pause, the last words only; nothing paid', async () => {
    const bible = mount('')
    const b = await box()
    await new Promise((r) => setTimeout(r, SAVE_MS + 100)) // the first read settles: opening writes nothing
    expect(bible.api.save).not.toHaveBeenCalled()
    for (const w of ['A', 'A k', 'A kitchen', 'A kitchen at dawn.']) fireEvent.change(b, { target: { value: w } })
    await new Promise((r) => setTimeout(r, SAVE_MS / 2))
    expect(bible.api.save).not.toHaveBeenCalled() // still typing
    await waitFor(() => expect(bible.api.save).toHaveBeenCalledTimes(1), { timeout: SAVE_MS + 1000 })
    expect(bible.api.save.mock.calls[0][0]).toMatchObject({ worldId: WORLD, prompt: 'A kitchen at dawn.' })
    await new Promise((r) => setTimeout(r, SAVE_MS + 100))
    expect(bible.api.save).toHaveBeenCalledTimes(1)
    expect(paid()).toEqual([])
  })

  it('a pause still running is written at once when focus leaves the box, and when the page is hidden (keepalive)', async () => {
    const bible = mount('')
    const b = await box()
    await new Promise((r) => setTimeout(r, SAVE_MS + 100))
    fireEvent.change(b, { target: { value: 'A pier.' } })
    act(() => { fireEvent.focusOut(b) })
    expect(bible.api.save).toHaveBeenCalledTimes(1)
    expect(bible.api.save.mock.calls[0][0]).toMatchObject({ prompt: 'A pier.' })
    fireEvent.change(b, { target: { value: 'A pier at dusk.' } })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    expect(bible.api.save).toHaveBeenCalledTimes(2)
    expect(bible.api.save.mock.calls[1]).toEqual([expect.objectContaining({ prompt: 'A pier at dusk.' }), { keepalive: true }])
    await new Promise((r) => setTimeout(r, SAVE_MS + 100))
    expect(bible.api.save).toHaveBeenCalledTimes(2) // the flushed pause is not written again
  })
})

describe('a scene’s name from its first words (pure)', () => {
  it('takes the first words of the first sentence', () => {
    expect(nameFromWords(WORDS)).toBe('A small farmhouse kitchen at dawn')
    expect(nameFromWords('  ')).toBeNull()
    expect(nameFromWords('Mara.')).toBe('Mara')
  })
  it('cuts at a word edge inside the name’s length', () => {
    const long = `${'a very long sentence '.repeat(12)}at dawn.`
    const name = nameFromWords(long)!
    expect(name.length).toBeLessThanOrEqual(80)
    expect(long.startsWith(name)).toBe(true)
    expect(name.endsWith(' ')).toBe(false)
  })
})

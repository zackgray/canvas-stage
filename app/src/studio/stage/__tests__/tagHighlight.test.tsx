// @vitest-environment jsdom
// The open Prompt box shows its @tags as the folded line's chips (TagHighlight.tsx): a copy of the words behind the transparent
// textarea, tinted by the scene's tiles (a person, a prop, a tag with no tile in red), kept in step with typing, the box's size and
// its scroll, while the textarea stays the one input (its value, the @ menu, saving). Both boxes: the take's words and the scene's.
// Fake servers, nothing paid.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DraftDesign } from '../../../shared/sceneContract'
import type { TakeBoardRow } from '../../../shared/takeWordsContract'
import type { BriefApi } from '../../scene/briefApi'
import { mkPiece } from '../../scene/design/model'
import { freshDesign, type Design } from '../../scene/design/state'
import { fakeApi, WORLD } from '../../scene/__tests__/fakes'
import { resetL2RStore } from '../../render/l2rStore'
import { resetCurrentTake, setCurrentTake } from '../../shoot/currentTake'
import { resetTakeBoard } from '../../shoot/takeBoard'
import { resetLockedTakes } from '../../shoot/worldTakes'
import { Drawer, resetDrawerChoice } from '../PromptDrawer'
import { syncCopy, TagRuns } from '../TagHighlight'

const SCENE = 'sc-test-hl'
const TAKE = 'take-2026-10-28T10-00-00-000'
const draftOf = (brief: string): Design => ({ ...freshDesign(), screen: 'board', phase: 'board', brief, v2: null,
  pieces: [mkPiece('driver', 'Driver', 'person', { onBoard: true }), mkPiece('car2', 'Car', 'prop', { onBoard: true })] })
const io = (brief: string) => ({
  loadDraft: vi.fn(async () => draftOf(brief) as unknown as DraftDesign), saveDraft: vi.fn(async () => {}),
  uploadReference: vi.fn(async () => '/x.png'), status: vi.fn(async () => { throw new Error('no planner here') }),
}) as unknown as BriefApi

let row: TakeBoardRow
let noTakes = false
let posts: { prompt?: string }[]
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })
beforeEach(() => {
  resetDrawerChoice(); Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1080 })
  posts = []; noTakes = false
  row = { id: TAKE, name: null, thumb: null, state: 'locked', words: '@driver pulls up beside @car2.\nThen @ghost waves.', own: true, sceneChanged: false }
  resetCurrentTake(); resetTakeBoard(); resetLockedTakes(); resetL2RStore()
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const p = String(url).split('?')[0]
    if (p === '/__lab/takes/board') return json({ rows: noTakes ? [] : [row], scenePrompt: 'A street.' })
    if (p === '/__lab/takes/words') { const b = JSON.parse(String(init!.body)); posts.push(b); row = { ...row, words: b.prompt }; return json({ take: { id: TAKE } }) }
    if (p === '/__lab/takes/sources') return json({ sources: [] })
    if (p === '/__lab/takes') return json({ takes: [] })
    return new Response('null', { status: 404 })
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetTakeBoard(); resetLockedTakes(); resetL2RStore(); localStorage.clear() })

const mount = (brief: string) => render(<Drawer scene={SCENE} worldId={WORLD} deps={{ api: io(brief), bible: fakeApi().api }} />)
const tags = () => screen.getAllByTestId('hl-tag').map((t) => `${t.textContent}:${t.className}`)

describe("the take's words box, open", () => {
  it('shows each tag as the chip the folded line shows: a person, a prop, a tag with no tile in red; the text is the same words', async () => {
    setCurrentTake(TAKE)
    mount('A street.')
    const box = await screen.findByTestId('take-words-input') as HTMLTextAreaElement
    expect(box.closest('.st-hl-wrap')).toBeTruthy()
    expect(tags()).toEqual(['@driver:st-hl-tag ', '@car2:st-hl-tag w', '@ghost:st-hl-tag  gone'])
    expect(screen.getByTestId('hl-copy').textContent).toBe(box.value)
    expect(screen.getByTestId('hl-copy').getAttribute('aria-hidden')).toBe('true')
  })

  it('follows the typing, and the box stays the input: the @ menu and the save on leaving', async () => {
    setCurrentTake(TAKE)
    mount('A street.')
    const box = await screen.findByTestId('take-words-input') as HTMLTextAreaElement
    fireEvent.focus(box)
    fireEvent.change(box, { target: { value: '@driver stops beside it. @dr', selectionStart: 28, selectionEnd: 28 } })
    box.setSelectionRange(28, 28); fireEvent.select(box)
    expect(screen.getByTestId('hl-copy').textContent).toBe('@driver stops beside it. @dr')
    fireEvent.mouseDown(await screen.findByTestId('at-driver'))
    await waitFor(() => expect(box.value).toBe('@driver stops beside it. @driver '))
    await waitFor(() => expect(tags()).toEqual(['@driver:st-hl-tag ', '@driver:st-hl-tag ']))
    fireEvent.blur(box)
    await waitFor(() => expect(posts).toEqual([{ takeId: TAKE, prompt: '@driver stops beside it. @driver ' }]))
  })

  it('scrolls with the box: a scroll of the textarea moves the copy to the same place', async () => {
    setCurrentTake(TAKE)
    mount('A street.')
    const box = await screen.findByTestId('take-words-input') as HTMLTextAreaElement
    const copy = screen.getByTestId('hl-copy')
    Object.defineProperty(box, 'scrollTop', { configurable: true, value: 64 })
    fireEvent.scroll(box)
    expect(copy.scrollTop).toBe(64)
  })
})

describe('the scene words box, open', () => {
  beforeEach(() => { noTakes = true })
  it('shows the same chips while editing; a half-typed tag with no tile yet is red, as the folded line shows it', async () => {
    mount('@driver pulls up beside @car2.')
    fireEvent.click(await screen.findByTestId('stage-brief-view'))
    const box = await screen.findByTestId('stage-brief-input') as HTMLTextAreaElement
    expect(box.closest('.st-hl-wrap')).toBeTruthy()
    expect(tags()).toEqual(['@driver:st-hl-tag ', '@car2:st-hl-tag w'])
    fireEvent.change(box, { target: { value: '@driver pulls up beside @car2 and @nob' } }) // half typed: no draft tile yet
    expect(tags()).toEqual(['@driver:st-hl-tag ', '@car2:st-hl-tag w', '@nob:st-hl-tag  gone'])
  })
})

describe('the copy itself', () => {
  it('a closing newline keeps its empty line; text runs carry no chip', () => {
    render(<div data-testid="c"><TagRuns text={'a @x\n'} look={() => ({ gone: false })} /></div>)
    expect(screen.getByTestId('c').textContent).toBe('a @x\n ')
  })
  it("syncCopy lays the copy inside the box's border at its client size, in its font and padding, scrolled as it is", () => {
    const ta = document.createElement('textarea')
    ta.style.padding = '4px 8px'; ta.style.fontSize = '15px'; ta.style.lineHeight = '1.6'
    document.body.appendChild(ta)
    for (const [k, v] of Object.entries({ offsetLeft: 10, offsetTop: 20, clientLeft: 1, clientTop: 2, clientWidth: 300, clientHeight: 120, scrollTop: 40 })) Object.defineProperty(ta, k, { configurable: true, value: v })
    const copy = document.createElement('div')
    syncCopy(ta, copy)
    expect([copy.style.left, copy.style.top, copy.style.width, copy.style.height]).toEqual(['11px', '22px', '300px', '120px'])
    expect([copy.style.paddingLeft, copy.style.paddingTop, copy.style.fontSize, copy.style.lineHeight]).toEqual(['8px', '4px', '15px', '1.6'])
    expect(copy.scrollTop).toBe(40)
    ta.remove()
  })
})

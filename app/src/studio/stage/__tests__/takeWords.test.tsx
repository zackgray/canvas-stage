// @vitest-environment jsdom
// The take on show's own words in the drawer: typed words saved for this take only; "Start from…" copies another take's or scene's
// words in (a copy, rebased on the scene prompt now); a scene prompt changed since offers nothing (one-prompt); every write tells
// the page (TAKE_WORDS_CHANGED) so the first frame's staleness is read again. Fake server, nothing paid.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TAKE_WORDS_CHANGED, type TakeBoardRow, type WordsSource } from '../../../shared/takeWordsContract'
import { resetL2RStore } from '../../render/l2rStore'
import { resetCurrentTake, setCurrentTake } from '../../shoot/currentTake'
import { resetTakeBoard } from '../../shoot/takeBoard'
import { resetLockedTakes } from '../../shoot/worldTakes'
import { TakeWords } from '../TakeWords'

const ID = 'take-2026-10-28T10-00-00-000'
let row: TakeBoardRow
let posts: unknown[] = []
const sources: WordsSource[] = [
  { kind: 'take', id: 'take-2026-10-27T10-00-00-000', name: 'Close', scene: 'Harbour', words: 'A close shot in rain.' },
  { kind: 'scene', id: 'sc-20261028120000-bbbb', name: 'Desert', scene: null, words: 'A dune at noon.' },
]

beforeEach(() => {
  posts = []
  row = { id: ID, name: null, thumb: null, state: 'locked', words: 'A pier at dusk.', own: true, sceneChanged: false }
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const p = String(url).split('?')[0]
    if (p === '/__lab/takes/board') return json({ rows: [row], scenePrompt: 'A pier at night.' })
    if (p === '/__lab/takes/sources') return json({ sources })
    if (p === '/__lab/takes/words') {
      const b = JSON.parse(String(init!.body)); posts.push(b)
      row = { ...row, words: b.fromScene ? 'A pier at night.' : b.prompt, sceneChanged: false }
      return json({ take: { id: ID } })
    }
    if (p === '/__lab/takes') return json({ takes: [] })
    return json({})
  }))
  resetCurrentTake(); resetTakeBoard(); resetLockedTakes(); resetL2RStore(); setCurrentTake(ID)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetTakeBoard(); resetLockedTakes(); resetL2RStore() })

describe("the take's own words", () => {
  it('shows nothing without a take on show', async () => {
    resetCurrentTake()
    render(<TakeWords worldId="loc-1" />)
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByTestId('take-words')).toBeNull()
  })

  it('typed words are saved for this take when the box is left, and the page is told', async () => {
    const told = vi.fn()
    window.addEventListener(TAKE_WORDS_CHANGED, told)
    render(<TakeWords worldId="loc-1" />)
    const box = await screen.findByTestId('take-words-input') as HTMLTextAreaElement
    expect(box.value).toBe('A pier at dusk.')
    fireEvent.focus(box)
    fireEvent.change(box, { target: { value: 'A pier at dusk, close on her.' } })
    expect(posts).toEqual([]) // nothing until the box is left
    fireEvent.blur(box)
    await waitFor(() => expect(posts).toEqual([{ takeId: ID, prompt: 'A pier at dusk, close on her.' }]))
    await waitFor(() => expect(told).toHaveBeenCalled())
    window.removeEventListener(TAKE_WORDS_CHANGED, told)
  })

  it('leaving the box unchanged writes nothing', async () => {
    render(<TakeWords worldId="loc-1" />)
    const box = await screen.findByTestId('take-words-input')
    fireEvent.focus(box); fireEvent.blur(box)
    await new Promise((r) => setTimeout(r, 20))
    expect(posts).toEqual([])
  })

  it("Start from… lists other takes and scenes and copies the picked one's words in", async () => {
    render(<TakeWords worldId="loc-1" />)
    const pick = await screen.findByTestId('take-words-from')
    fireEvent.focus(pick)
    await waitFor(() => expect(pick.querySelectorAll('option')).toHaveLength(3))
    expect([...pick.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['pick one to copy', 'Close (Harbour)', 'Scene: Desert'])
    fireEvent.change(pick, { target: { value: '1' } })
    await waitFor(() => expect(posts).toEqual([{ takeId: ID, prompt: 'A dune at noon.', rebase: true }]))
    await waitFor(() => expect((screen.getByTestId('take-words-input') as HTMLTextAreaElement).value).toBe('A dune at noon.'))
  })

  it('a scene prompt changed since offers nothing: the words underneath are never shown by that name (one-prompt)', async () => {
    row = { ...row, sceneChanged: true }
    render(<TakeWords worldId="loc-1" />)
    expect((await screen.findByTestId('take-words-input') as HTMLTextAreaElement).value).toBe(row.words)
    expect(screen.queryByTestId('take-scene-changed')).toBeNull()
    expect(screen.queryByTestId('take-update-from-scene')).toBeNull()
    expect(screen.getByTestId('take-words').textContent).not.toMatch(/scene prompt|Update from scene/i)
    expect(posts).toEqual([])
  })
})

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { PlayedByAsk } from './playedBy'

const el = (tag: string, cardId?: string) => ({ tag, kind: 'cast', ...(cardId ? { cardId } : {}) })
let bible: { elements: unknown[]; prompt?: string } | null
/** the performance as the server has it (what the pick is written onto) */
let server: Record<string, unknown>
const saved: unknown[] = []
beforeEach(() => {
  saved.length = 0
  server = { path: [[0, 0], [3, 0]] }
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/performance')) { saved.push(JSON.parse(init!.body as string)); return new Response(JSON.stringify({ id: 'loc-a', perf: {} })) }
    if (url.includes('/stage3d/world')) return new Response(JSON.stringify({ id: 'loc-a', perf: server }))
    return new Response(JSON.stringify({ bible }))
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const lab = (castId?: string) => ({ kit: { world: { id: 'loc-a', perf: { path: [[0, 0], [3, 0]], ...(castId ? { castId } : {}) } } } }) as unknown as ProjectionLabState

describe('Played by', () => {
  it('one cast character plays the performer on its own: saved once, nothing asked', async () => {
    bible = { elements: [el('agnes', 'cast-1'), { tag: 'lamp', kind: 'prop' }] }
    render(<PlayedByAsk lab={lab()} />)
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0]).toMatchObject({ castId: 'cast-1', path: [[0, 0], [3, 0]] })
    expect(screen.queryByTestId('played-by-ask')).toBeNull()
  })

  it('several characters: the ask is shown by the still\'s button, and the pick is saved', async () => {
    bible = { elements: [el('agnes', 'cast-1'), el('tom', 'cast-2')] }
    render(<PlayedByAsk lab={lab()} />)
    const pick = await screen.findByTestId('played-by')
    expect(saved).toHaveLength(0)
    fireEvent.change(pick, { target: { value: 'cast-2' } })
    await waitFor(() => expect(saved[0]).toMatchObject({ castId: 'cast-2' }))
  })

  it('the pick is written onto the performance the server has now, not the copy Shoot loaded (m-5)', async () => {
    bible = { elements: [el('agnes', 'cast-1')] }
    server = { path: [[0, 0], [5, 5], [9, 0]], extras: [{ path: [[1, 1], [2, 2]] }] } // Blocking saved after Shoot opened
    render(<PlayedByAsk lab={lab()} />)
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0]).toMatchObject({ castId: 'cast-1', path: [[0, 0], [5, 5], [9, 0]], extras: [{ path: [[1, 1], [2, 2]] }] })
  })

  it('someone named meanwhile: the auto-pick leaves them; a pick sets the card only, never a costume', async () => {
    bible = { elements: [el('agnes', 'cast-1')] }
    server = { path: [[0, 0], [3, 0]], castId: 'cast-7' }
    render(<PlayedByAsk lab={lab()} />)
    await new Promise((r) => setTimeout(r, 30))
    expect(saved).toHaveLength(0)
    cleanup()
    server = { path: [[0, 0], [3, 0]] }
    bible = { prompt: 'A kitchen at night. @tom washes a cup. @agnes waits by the stove.', elements: [{ ...el('agnes', 'cast-1'), line: 'a woman in a long linen apron' }] }
    render(<PlayedByAsk lab={lab()} />)
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0]).toEqual({ path: [[0, 0], [3, 0]], castId: 'cast-1' }) // no costume chosen from their words
  })

  it('someone already named, or no character with a card: nothing happens', async () => {
    bible = { elements: [el('agnes', 'cast-1')] }
    render(<PlayedByAsk lab={lab('cast-9')} />)
    cleanup()
    bible = { elements: [el('agnes')] }
    render(<PlayedByAsk lab={lab()} />)
    await new Promise((r) => setTimeout(r, 30))
    expect(saved).toHaveLength(0)
    expect(screen.queryByTestId('played-by-ask')).toBeNull()
  })
})

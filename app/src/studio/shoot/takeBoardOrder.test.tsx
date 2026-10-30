// @vitest-environment jsdom
// The take list's one copy of the rows (takeBoard.ts) under a stream of reads (every reader reads again on each take switch and
// each words write): a read started while others are still out lands, and an older answer arriving late never replaces a newer
// one. Fake server, nothing paid.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshBoard, resetTakeBoard, useTakeBoard } from './takeBoard'

let n = 0
const delays: number[] = []
beforeEach(() => {
  n = 0; delays.length = 0; resetTakeBoard()
  vi.stubGlobal('fetch', vi.fn(async () => {
    const mine = ++n
    await new Promise((r) => setTimeout(r, delays.shift() ?? 30))
    return new Response(JSON.stringify({ rows: [{ id: 'take-x', name: null, thumb: null, state: 'locked', words: `read ${mine}`, own: true, sceneChanged: false }], scenePrompt: '' }), { status: 200 })
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetTakeBoard() })

describe('the board under many reads', () => {
  it('reads that overlap without a lull still land, and the newest answer stays', async () => {
    const h = renderHook(() => useTakeBoard('loc-1'))
    await waitFor(() => expect(h.result.current.rows[0]?.words).toMatch(/^read /))
    const first = h.result.current.rows[0]?.words
    // a stream: each new read starts before the one before it answers; answers land while it goes on
    for (let i = 0; i < 8; i++) { void refreshBoard(); await act(async () => { await new Promise((r) => setTimeout(r, 10)) }) }
    expect(h.result.current.rows[0]?.words).not.toBe(first) // the last read is still out
    await waitFor(() => expect(h.result.current.rows[0]?.words).toBe(`read ${n}`))
  })

  it('an older answer arriving after a newer one is dropped', async () => {
    const h = renderHook(() => useTakeBoard('loc-1'))
    await waitFor(() => expect(h.result.current.rows[0]?.words).toMatch(/^read /))
    const before = n
    delays.push(120, 10) // the first read answers last
    void refreshBoard(); void refreshBoard()
    await act(async () => { await new Promise((r) => setTimeout(r, 200)) })
    expect(h.result.current.rows[0]?.words).toBe(`read ${before + 2}`)
  })
})

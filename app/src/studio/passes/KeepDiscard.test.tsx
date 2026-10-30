// @vitest-environment jsdom
// The Keep / Discard card: crops at their own pixels, Keep locked until both have loaded, the running and failed states, and the
// hook's list / decide / poll against a fake server.
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PassCandidate } from '../../shared/passContract'
import { KeepDiscard } from './KeepDiscard'
import { POLL_MS, usePassCandidates } from './usePassCandidates'

const base: PassCandidate = { id: 'pass-1', takeId: 'take-1', pass: 'prop', target: { kind: 'still', stillId: 'hero-1' }, subject: 'wagon', box: { x: 0, y: 0, w: 300, h: 200 },
  state: 'candidate', beforeUrl: '/b.png', afterUrl: '/a.png', beforeCropUrl: '/bc.png', afterCropUrl: '/ac.png', jobId: 'job-12345678', costCredits: 4, createdAt: '2026-10-24T10:00:00.000Z' }
const cb = () => ({ onKeep: vi.fn(), onDiscard: vi.fn(), onRecover: vi.fn() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('KeepDiscard', () => {
  it('shows before beside after at natural size with the price, and Keep stays locked until both have loaded', () => {
    const f = cb(); render(<KeepDiscard candidate={base} {...f} />)
    const before = screen.getByTestId('pass-before'), after = screen.getByTestId('pass-after')
    expect([before.getAttribute('src'), after.getAttribute('src')]).toEqual(['/bc.png', '/ac.png'])
    expect(screen.getByText(/≈ 4 cr paid/)).toBeTruthy()
    const keep = screen.getByTestId('pass-keep') as HTMLButtonElement
    expect(keep.disabled).toBe(true); fireEvent.click(keep); expect(f.onKeep).not.toHaveBeenCalled()
    fireEvent.load(before); expect(keep.disabled).toBe(true)
    fireEvent.load(after); expect(keep.disabled).toBe(false)
    fireEvent.click(keep); fireEvent.click(screen.getByTestId('pass-discard'))
    expect([f.onKeep.mock.calls.length, f.onDiscard.mock.calls.length]).toEqual([1, 1])
  })
  it('Keep never unlocks without crops to compare; Discard is always there', () => {
    render(<KeepDiscard candidate={{ ...base, beforeCropUrl: null, afterCropUrl: null }} {...cb()} />)
    expect((screen.getByTestId('pass-keep') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('pass-discard') as HTMLButtonElement).disabled).toBe(false)
  })
  it('running shows a clock and the price; failed shows the error and Recover only when a job was billed', () => {
    const f = cb()
    const { rerender } = render(<KeepDiscard candidate={{ ...base, state: 'running', afterUrl: null }} {...f} />)
    expect(screen.getByTestId('elapsed')).toBeTruthy()
    rerender(<KeepDiscard candidate={{ ...base, state: 'failed', error: 'job is still running' }} {...f} />)
    expect(screen.getByTestId('pass-error').textContent).toBe('job is still running')
    fireEvent.click(screen.getByTestId('pass-recover')); expect(f.onRecover).toHaveBeenCalledTimes(1)
    rerender(<KeepDiscard candidate={{ ...base, state: 'failed', error: 'refused', jobId: null }} {...f} />)
    expect(screen.queryByTestId('pass-recover')).toBeNull()
  })
})

describe('usePassCandidates', () => {
  let list: PassCandidate[]
  const posts: string[] = []
  beforeEach(() => {
    list = [{ ...base, state: 'running', afterUrl: null }]; posts.length = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
      if (init?.method === 'POST') { posts.push(`${url} ${init.body}`); return url.endsWith('/keep') ? ok({ error: 'the image changed', code: 'target_changed' }, 409) : ok({ candidate: { ...list[0], state: 'discarded' } }) }
      return ok({ candidates: list })
    }))
  })
  it('lists, polls while one is running, stops once it lands, and posts decisions by id', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { result } = renderHook(() => usePassCandidates('take-1'))
    await waitFor(() => expect(result.current.candidates[0]?.state).toBe('running'))
    list = [{ ...base }]
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS + 10) })
    await waitFor(() => expect(result.current.candidates[0].state).toBe('candidate'))
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 3) })
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls) // nothing running: no polling
    await act(async () => { await result.current.keep('pass-1') })
    expect(result.current.error).toBe('the image changed')
    await act(async () => { await result.current.discard('pass-1') })
    expect(posts).toEqual(['/__lab/passes/keep {"id":"pass-1"}', '/__lab/passes/discard {"id":"pass-1"}'])
  })
})

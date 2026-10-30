// @vitest-environment jsdom
// Lost work (QA 2026-10-27 e2e): the brief, the Draft toggle and cast looks were kept locally at once but written to the server's
// draft only 600 ms after the last change, and Scene opens on the server's draft, so a tab closed inside that pause (or while the
// write was out) reopened on the older copy. Now a pending write is sent when the page is hidden or left, and a local copy newer
// than the server's stands when Scene opens.
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SAVE_MS, useDesign } from '../design/useDesign'
import { freshDesign, isUnsynced, designKey } from '../design/state'
import type { BriefApi } from '../briefApi'

afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers() })

const io = (server: Record<string, unknown> | null = null) => {
  const saveDraft = vi.fn(async (_d: unknown, _o?: { keepalive?: boolean }) => {})
  const api = { loadDraft: vi.fn(async () => server), saveDraft } as unknown as Pick<BriefApi, 'loadDraft' | 'saveDraft'>
  return { api, saveDraft }
}
const flushPromises = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

describe('the draft is written before a quick close', () => {
  it('pagehide inside the save pause writes the change now, with keepalive', async () => {
    vi.useFakeTimers()
    const { api, saveDraft } = io()
    const { result } = renderHook(() => useDesign([], api, 'sc-1'))
    await flushPromises()
    act(() => result.current.set({ quality: 'draft', brief: 'a quiet orchard' }))
    expect(saveDraft).not.toHaveBeenCalled()
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    expect(saveDraft).toHaveBeenCalledTimes(1)
    expect(saveDraft.mock.calls[0][0]).toMatchObject({ quality: 'draft', brief: 'a quiet orchard' })
    expect(saveDraft.mock.calls[0][1]).toEqual({ keepalive: true })
    await act(async () => { vi.advanceTimersByTime(SAVE_MS * 3) })
    expect(saveDraft).toHaveBeenCalledTimes(1) // the pause was spent: no second write
  })

  it('a hidden tab and a leaving Scene write it too; a visible tab does not', async () => {
    vi.useFakeTimers()
    const { api, saveDraft } = io()
    const { result, unmount } = renderHook(() => useDesign([], api, 'sc-1'))
    await flushPromises()
    act(() => result.current.set({ brief: 'one' }))
    act(() => { document.dispatchEvent(new Event('visibilitychange')) }) // jsdom: visible
    expect(saveDraft).not.toHaveBeenCalled()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(saveDraft).toHaveBeenCalledTimes(1)
    vi.restoreAllMocks()
    act(() => result.current.set({ brief: 'two' }))
    unmount()
    expect(saveDraft).toHaveBeenCalledTimes(2)
    expect(saveDraft.mock.calls[1][0]).toMatchObject({ brief: 'two' })
  })

  it('a settled change still writes once after the pause and clears the unsynced mark', async () => {
    vi.useFakeTimers()
    const { api, saveDraft } = io()
    const { result } = renderHook(() => useDesign([], api, 'sc-1'))
    await flushPromises()
    act(() => result.current.set({ brief: 'x' }))
    expect(isUnsynced('sc-1')).toBe(true)
    await act(async () => { vi.advanceTimersByTime(SAVE_MS + 1) })
    await flushPromises()
    expect(saveDraft).toHaveBeenCalledTimes(1)
    expect(isUnsynced('sc-1')).toBe(false)
  })
})

describe('reopening after a quick close', () => {
  it('a local copy newer than the server draft stands and is written back', async () => {
    localStorage.setItem(designKey('sc-1'), JSON.stringify({ ...freshDesign(), brief: 'typed just before closing', quality: 'draft' }))
    localStorage.setItem(`${designKey('sc-1')}.unsynced`, '1')
    const { api, saveDraft } = io({ ...freshDesign(), brief: 'older server copy' })
    const { result } = renderHook(() => useDesign([], api, 'sc-1'))
    await flushPromises()
    expect(result.current.d.brief).toBe('typed just before closing')
    expect(result.current.d.quality).toBe('draft')
    await vi.waitFor(() => expect(saveDraft).toHaveBeenCalled())
    expect(saveDraft.mock.calls[0][0]).toMatchObject({ brief: 'typed just before closing' })
  })

  it('with nothing unsynced the server draft still wins', async () => {
    localStorage.setItem(designKey('sc-1'), JSON.stringify({ ...freshDesign(), brief: 'old local' }))
    const { api } = io({ ...freshDesign(), brief: 'server copy' })
    const { result } = renderHook(() => useDesign([], api, 'sc-1'))
    await flushPromises()
    expect(result.current.d.brief).toBe('server copy')
  })
})

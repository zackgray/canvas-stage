// @vitest-environment jsdom
// Pass 3: an approved set edited on the Stage is approved again (free) once the edits settle; a never-approved set is left to the
// owner; a refused press says why with its one-press Approve the set, and never names another screen.
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KIT_CHANGED } from '../../../labs/projection/stage3d/kitApi'
import { SET_CHANGED, SET_NOT_APPROVED } from '../../../shared/setApproval'
import type { BibleApi } from '../../scene/bibleApi'
import { isSetRefusal, useAutoReapprove } from '../useAutoReapprove'
import { SetRefusal } from '../panels/SetRefusal'

afterEach(() => { cleanup(); vi.useRealTimers() })
const fakeApi = (approval: { key: string; at: string } | null, key: string) => {
  const approveSet = vi.fn(async () => ({} as never))
  return { api: { get: vi.fn(async () => ({ bible: null, setApproval: approval, setKey: key } as never)), approveSet } as unknown as BibleApi, approveSet }
}
const edit = (id = 'loc-1') => window.dispatchEvent(new CustomEvent(KIT_CHANGED, { detail: { id } }))

describe('an approved set stays approved while it is edited', () => {
  it('edits in a burst: one free re-approval, after they settle', async () => {
    vi.useFakeTimers()
    const { api, approveSet } = fakeApi({ key: 'old', at: 't' }, 'new')
    renderHook(() => useAutoReapprove('loc-1', api, 1000))
    edit(); await act(async () => { vi.advanceTimersByTime(600) }); edit(); await act(async () => { vi.advanceTimersByTime(600) })
    expect(approveSet).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(500) })
    vi.useRealTimers()
    await waitFor(() => expect(approveSet).toHaveBeenCalledTimes(1))
    expect(approveSet).toHaveBeenCalledWith('loc-1')
  })
  it('a set never approved is left alone; another world\'s edit is ignored', async () => {
    const { api, approveSet } = fakeApi(null, 'new')
    renderHook(() => useAutoReapprove('loc-1', api, 5))
    edit(); edit('loc-2')
    await new Promise((r) => setTimeout(r, 40))
    expect(approveSet).not.toHaveBeenCalled()
  })
})

describe('a refused press', () => {
  it('names no other screen, and offers Approve the set in one press', async () => {
    expect(SET_NOT_APPROVED).not.toMatch(/Set & master|Scene ›/)
    expect(SET_CHANGED).not.toMatch(/Set & master|Scene ›/)
    expect(isSetRefusal(SET_CHANGED)).toBe(true)
    expect(isSetRefusal('The day budget is spent.')).toBe(false)
    const approve = vi.fn(async () => undefined)
    render(<SetRefusal text={SET_CHANGED} worldId="loc-1" approve={approve} />)
    fireEvent.click(screen.getByTestId('set-refusal-approve'))
    expect(await screen.findByTestId('set-refusal-done')).toBeTruthy()
    expect(approve).toHaveBeenCalledWith('loc-1')
  })
})

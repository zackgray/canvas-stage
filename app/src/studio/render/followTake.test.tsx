// @vitest-environment jsdom
// The Stage, 2026-10-27: a take locked on the Stage (Camera panel: "Take locked.") left Render grey with "Lock a take first."
// until a reload, and an approved first frame left it saying to approve one. The render store follows the current take and
// reads the still's approval again at once.
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TakeRecord } from '../../shared/shotContract'
import { resetCurrentTake, setCurrentTake } from '../shoot/currentTake'
import { useL2R } from './l2rModel'
import { resetL2RStore, stillChanged } from './l2rStore'
import { primaryFor, L2R_NEEDS_STILL } from '../screens/primaryAction'

const take: TakeRecord = { id: 'take-2026-10-27T05-00-00-001', worldId: 'loc-a', packId: null, fps: 24, frames: 193, samples: [], focal: 35, viewAspect: 1.77,
  perfStart: 0, startKey: 'k', lockedAt: '2026-10-27T05:00:00.001Z', createdAt: 't' }
let locked: TakeRecord[]
let approved: boolean
const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  resetL2RStore(); resetCurrentTake(); locked = []; approved = false
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/__lab/takes') return ok({ takes: locked })
    if (url.startsWith('/__lab/l2r?take=')) return ok({ renders: [], take, still: approved ? { id: 's1' } : null, missing: approved ? [] : [{ code: 'no_still' }] })
    return ok({})
  }))
})
afterEach(() => { vi.unstubAllGlobals(); resetL2RStore(); resetCurrentTake() })

describe('Render follows the take the Stage just locked', () => {
  it('a lock after the press was on screen is read at once, and an approval is read at once', async () => {
    const { result } = renderHook(() => useL2R('loc-a'))
    await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
    expect(primaryFor(result.current).action).toBe('needs-take')
    locked = [take]
    await act(async () => { setCurrentTake(take.id) })
    await waitFor(() => expect(primaryFor(result.current).why).toBe(L2R_NEEDS_STILL))
    approved = true
    await act(async () => { await stillChanged() })
    await waitFor(() => expect(primaryFor(result.current).action).toBe('l2r'))
  })
})

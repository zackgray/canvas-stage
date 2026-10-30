// @vitest-environment jsdom
// A section's GET reports the server's one running job of that section, whichever scene pressed it. A screen counts it only when it
// names the take on show: another scene's hero still or render never shows here or disables this scene's button.
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isBusy, loadTakes, resetL2RStore, useL2RSnapshot } from '../../studio/render/l2rStore'
import { namesTarget, runningOf } from '../scope'

afterEach(() => { vi.unstubAllGlobals(); resetL2RStore() })

describe("only this take's running job counts", () => {
  it('a hero claim, a hero runner label and an L2R label name their take as a whole word', () => {
    expect(namesTarget('a hero still of take-3', 'take-3')).toBe(true)
    expect(namesTarget('hero-still take-3 hero-2026-1', 'take-3')).toBe(true)
    expect(namesTarget('l2r take-3 l2r-9', 'take-3')).toBe(true)
    expect(namesTarget('a hero still of take-33', 'take-3')).toBe(false) // a longer id is another take
    expect(namesTarget('a hero still of take-3', null)).toBe(false)
    const r = { since: 't', what: 'a Layout-To-Render pass of take-7' }
    expect(runningOf(r, 'take-7')).toBe(r)
    expect(runningOf(r, 'take-8')).toBeNull()
  })

  it("Render: another scene's render running on the server does not make this take's Render busy; its own does", async () => {
    let what = 'a Layout-To-Render pass of take-7'
    const take = { id: 'take-8', worldId: 'loc-b', lockedAt: '2026-10-24T10:00:00Z', frames: 9 }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.startsWith('/__lab/takes')
      ? { takes: [take] } : { renders: [], running: { since: 't', what } }), { headers: { 'content-type': 'application/json' } })))
    const { result } = renderHook(() => useL2RSnapshot())
    await act(async () => { await loadTakes() })
    expect(result.current.takeId).toBe('take-8')
    expect(result.current.status?.running).toBeNull()
    expect(isBusy(result.current)).toBe(false)
    what = 'l2r take-8 l2r-1'
    await act(async () => { await loadTakes() })
    expect(isBusy(result.current)).toBe(true)
  })
})

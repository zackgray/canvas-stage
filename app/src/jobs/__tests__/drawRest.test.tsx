// @vitest-environment jsdom
// The board is drawn by one press (Generate the board, then Draw the rest). When the run stops (a refused tile, a closed tab, a
// reload) the tiles not drawn yet are offered as one priced "Draw the rest", also on reopening the scene, and that press draws
// only those, once each. A tile whose draw is still out is never sent again. Fake brief client; real job store; nothing reaches Cloud.
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PlannerError } from '../../studio/scene/briefApi'
import { fakeBrief } from '../../studio/scene/__tests__/briefFakes'
import { mkPiece, pieceCredits } from '../../studio/scene/design/model'
import { useDesign } from '../../studio/scene/design/useDesign'
import { useDesignCalls } from '../../studio/scene/design/useDesignCalls'
import { resetSceneJobs, SceneJobs } from '../sceneJobs'

afterEach(() => { localStorage.clear(); resetSceneJobs() })
const tiles = () => ['mood', 'light', 'candles', 'brick'].map((t) => mkPiece(t, t, 'location'))
const each = pieceCredits({ type: 'location' }, 'full')

function mount(brief = fakeBrief(), jobs = new SceneJobs(null)) {
  return renderHook(() => { const s = useDesign([], brief); return { s, c: useDesignCalls(s, brief, jobs) } })
}

describe('Draw the rest', () => {
  it('a refused tile stops the run; the rest is one priced press that draws only the tiles not drawn yet', async () => {
    const brief = fakeBrief()
    const h = mount(brief)
    act(() => h.result.current.s.set({ quality: 'full', pieces: tiles() }))
    expect(h.result.current.c.rest).toBeNull() // no board yet: Generate the board is the press
    let n = 0
    const draw = brief.candidates.getMockImplementation()!
    brief.candidates.mockImplementation(async (r) => { if (++n === 2) throw new PlannerError('over the day budget', 429, false); return draw(r) })
    await act(async () => { h.result.current.c.generateBoard() })
    await waitFor(() => expect(h.result.current.s.d.phase).toBe('board'))
    expect(brief.candidates).toHaveBeenCalledTimes(2)
    expect(h.result.current.c.error).toMatch(/Draw the rest \(≈ \d+ cr\)/)
    expect(h.result.current.c.rest).toEqual({ n: 3, credits: 3 * each })
    expect(h.result.current.c.restLabel).toBe('Draw the rest (3)') // its price beside it, as on every paid button
    expect(h.result.current.s.d.pieces.some((p) => p.loading)).toBe(false) // nothing left spinning

    brief.candidates.mockImplementation(draw)
    await act(async () => { h.result.current.c.drawRest() })
    await waitFor(() => expect(h.result.current.c.rest).toBeNull())
    expect(brief.candidates).toHaveBeenCalledTimes(5) // the three left, once each; the drawn one never again
    expect(h.result.current.s.d.pieces.every((p) => p.looks.length === 1)).toBe(true)
  })

  it('on reopening a scene whose run was cut off by a closed tab, the rest is offered, not a silent "Not drawn yet"', async () => {
    const [a, ...left] = tiles()
    const saved = { phase: 'generating', screen: 'board', quality: 'full',
      pieces: [{ ...a, onBoard: true, looks: ['/a.png'] }, ...left.map((p) => ({ ...p, onBoard: true, loading: true }))] }
    const brief = fakeBrief({ draft: saved })
    const h = mount(brief)
    await waitFor(() => expect(h.result.current.s.synced).toBe(true))
    await waitFor(() => expect(h.result.current.c.rest).toEqual({ n: 3, credits: 3 * each }))
    expect(brief.candidates).not.toHaveBeenCalled() // nothing paid starts by itself on reopening
  })

  it('a tile whose draw is still out (sent before a reload) is not sent again by Draw the rest', async () => {
    const jobs = new SceneJobs(null)
    const brief = fakeBrief()
    const h = mount(brief, jobs)
    const ps = tiles().map((p) => ({ ...p, onBoard: true }))
    act(() => h.result.current.s.set({ phase: 'board', quality: 'full', pieces: ps }))
    let out!: () => void
    void jobs.run({ intent: 'concept', target: `tile:${ps[0].id}`, price: each }, () => new Promise<void>((ok) => { out = ok }))
    await waitFor(() => expect(h.result.current.c.rest?.n).toBe(3))
    await act(async () => { h.result.current.c.drawRest() })
    await waitFor(() => expect(brief.candidates).toHaveBeenCalledTimes(3))
    await act(async () => { out() })
  })
})

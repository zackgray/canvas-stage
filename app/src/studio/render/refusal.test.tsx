// @vitest-environment jsdom
// QA 2026-10-27 e2e: a render the server refused (day budget, 429) showed "rendering, 58 cr spent" and went quiet; "A render is
// running" stayed for minutes when none ran (another scene's finish, or a stuck claim). The refusal is said in the server's words,
// "spent" shows only once the server runs the render, and neither a foreign finish nor a stale claim keeps Render shut.
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JobLine } from '../../jobs/JobLine'
import { resetSceneJobs } from '../../jobs/sceneJobs'
import { RenderRunPill } from './L2RBlock'
import { isBusy, isRenderBusy, loadTakes, render as press, resetL2RStore, STALE_RUN_MS, useL2RSnapshot, type L2RState } from './l2rStore'
import { TakeShot, FINISH_HINT } from '../screens/TakeShot'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetL2RStore(); resetSceneJobs() })

const BUDGET = 'Day budget reached: 484.8 of 500 credits spent today, this job needs about 58 more. Raise the daily spending limit (see SETUP) and restart the app to continue.'
const st = (status: Record<string, unknown> | null, over: Partial<L2RState> = {}) => ({ posting: false, working: false, status, ...over }) as unknown as L2RState
const NOW = Date.parse('2026-10-27T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

describe('a refused paid press', () => {
  it('says the server\'s reason, leaves nothing running, and the pill never showed "spent" before the server ran it', async () => {
    const take = { id: 'take-8', worldId: 'loc-b', lockedAt: '2026-10-24T10:00:00Z', frames: 9 }
    const still = { id: 'still-1', png: '/s.png' }
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
      if (init?.method === 'POST') return json({ error: BUDGET, code: 'budget' }, 429)
      return json(url.startsWith('/__lab/takes') ? { takes: [take] } : { renders: [], running: null, still, take, estimate: { credits: 58 } })
    }))
    const { result } = renderHook(() => useL2RSnapshot())
    await act(async () => { await loadTakes() })
    await act(async () => { await press() })
    expect(result.current.error).toBe(BUDGET)
    expect(result.current.posting).toBe(false)
    expect(isRenderBusy(result.current)).toBe(false)
    render(<JobLine line={result.current.error} testId="render-error" />)
    expect(screen.getByTestId('render-error').textContent).toBe(BUDGET)
  })

  it('RenderRunPill: "N cr spent" only once the server says the render runs', () => {
    const l = (running: object | null) => ({ price: 58, state: st({ running, take: { frames: 193 } }, { posting: true }) }) as unknown as Parameters<typeof RenderRunPill>[0]['l']
    render(<RenderRunPill l={l(null)} />)
    expect(screen.queryByTestId('render-pill-spent')).toBeNull()
    expect(screen.getByTestId('render-pill').textContent).toMatch(/sending the render/)
    cleanup()
    render(<RenderRunPill l={l({ since: new Date().toISOString(), what: 'l2r take-8 l2r-1' })} />)
    expect(screen.getByTestId('render-pill-spent').textContent).toContain('58')
  })
})

describe('"A render is running" with none running', () => {
  it("another scene's finish (the server lists every finishing render) does not count; this take's does", () => {
    const s = (finishing: string[]) => st({ running: null, finishing, renders: [{ id: 'l2r-mine', status: 'done' }] })
    expect(isBusy(s(['l2r-other']), NOW)).toBe(false)
    expect(isBusy(s(['l2r-mine']), NOW)).toBe(true)
    expect(isRenderBusy(s(['l2r-mine']), NOW)).toBe(false) // a free finish never shuts the paid press
  })
  it('a claim older than the stale limit is not believed; a fresh one is', () => {
    const run = (since: string) => st({ running: { since, what: 'l2r take-8 l2r-1' }, renders: [] })
    expect(isRenderBusy(run(ago(5 * 60_000)), NOW)).toBe(true)
    expect(isRenderBusy(run(ago(STALE_RUN_MS + 1000)), NOW)).toBe(false)
    const rec = (createdAt: string) => st({ running: null, renders: [{ id: 'r', status: 'running', createdAt }] })
    expect(isRenderBusy(rec(ago(60_000)), NOW)).toBe(true)
    expect(isRenderBusy(rec(ago(STALE_RUN_MS + 1000)), NOW)).toBe(false)
  })
})

describe('Export before the finish', () => {
  it('names where the finish runs and links back to Render', () => {
    const shot = { takeId: 'take-8', render: { id: 'r', status: 'done', raw: '/raw.mp4', finished: null, frames: 193 } } as unknown as Parameters<typeof TakeShot>[0]['shot']
    render(<TakeShot shot={shot} />)
    expect(screen.getByTestId('export-unfinished').textContent).toBe(FINISH_HINT)
    expect(FINISH_HINT).toBe('Finishing runs while the Render page is open: go back to Render and wait for Finished.')
    expect(screen.getByTestId('export-to-render').getAttribute('href')).toMatch(/\/render$/)
    cleanup()
    render(<TakeShot shot={{ ...shot, render: { ...shot.render!, finished: '/fin.mp4' } }} />)
    expect(screen.queryByTestId('export-unfinished')).toBeNull()
  })
})

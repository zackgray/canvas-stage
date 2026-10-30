// @vitest-environment jsdom
// Render's panel: only the shots list, the look beside the layout, the status, the player and Advanced are on show; every other
// control sits inside the one Advanced drawer (the take's defaults under its closed More), whose header counts what is off its
// default. A failed render's Recover stays outside it.
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { L2RRender, TakeRecord } from '../../shared/shotContract'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { resetSceneJobs } from '../../jobs/sceneJobs'
import { L2RBlock } from './L2RBlock'
import { resetL2RStore, setSeed } from './l2rStore'

const TAKE = 'take-2026-10-22T19-00-00-000'
const take: TakeRecord = { id: TAKE, worldId: 'loc-1', packId: null, fps: 24, frames: 97, samples: [], focal: 35, viewAspect: 1.77, perfStart: 0, startKey: 'k', lockedAt: 't', createdAt: 't' }
const clay = { takeId: TAKE, startKey: 'k', mp4: '/c.mp4', frames: 97, width: 1920 as const, height: 1088 as const, status: 'done' as const }
const still = { id: 'still-1', takeId: TAKE, startKey: 'k', png: '/s.png', seed: 1, jobId: null, credits: 1, approved: true, createdAt: 't' }
const done: L2RRender = { id: 'l2r-1', takeId: TAKE, stillId: 'still-1', clay: '/c.mp4', raw: '/raw.mp4', finished: '/fin.mp4', jobId: 'job-1', credits: 21, status: 'done', createdAt: 't' }
const failed: L2RRender = { ...done, id: 'l2r-2', raw: null, finished: null, status: 'failed' }
const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })
const answer = (renders: L2RRender[]) => ({ renders, take, clay, still, missing: [], prompt: 'p', configured: true, estimate: { credits: 21, perFrame: 0.21, frames: 97, basis: 'b' }, running: null, finishing: [] })
const lab = {} as ProjectionLabState
const mount = async (renders: L2RRender[]) => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/__lab/takes' ? ok({ takes: [take] }) : url.startsWith('/__lab/l2r?take=') ? ok(answer(renders)) : ok({ error: 'no' }))))
  render(<L2RBlock lab={lab} />)
  await screen.findByTestId('l2r-still')
}
beforeEach(() => resetL2RStore())
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetL2RStore(); resetSceneJobs() })

describe('Render panel: Advanced', () => {
  it('keeps the finish and what the render says in Advanced, the hold, keyframes and override under its closed More, no seed field, and the player and the shots outside it (review F7)', async () => {
    await mount([done])
    const adv = screen.getByTestId('advanced-render')
    for (const id of ['l2r-finishrow', 'l2r-composed']) expect(within(adv).getByTestId(id)).toBeTruthy()
    const more = within(adv).getByTestId('advanced-render-more')
    expect(more.hasAttribute('open')).toBe(false)
    expect(more.querySelector('summary')!.textContent).toBe('More')
    for (const id of ['l2r-hold', 'l2r-override']) expect(within(more).getByTestId(id)).toBeTruthy()
    expect(within(more).queryByTestId('l2r-composed')).toBeNull() // what the render says stays in view when Advanced opens
    expect(screen.queryByTestId('l2r-seed')).toBeNull()
    expect(adv.hasAttribute('open')).toBe(false)
    expect(within(adv).queryByTestId('l2r-player')).toBeNull()
    expect(screen.getByTestId('l2r-player')).toBeTruthy()
    expect(within(adv).queryByTestId('l2r-shots')).toBeNull()
    expect(screen.getByTestId('l2r-shots')).toBeTruthy()
    expect(adv.querySelector('summary')!.textContent).toBe('Advanced')
  })

  it('says on the collapsed header how many controls are off their default', async () => {
    await mount([done])
    act(() => setSeed(7))
    expect(screen.getByTestId('advanced-render').querySelector('summary')!.textContent).toBe('Advanced · 1 changed')
  })

  it('shows a lost render and its Recover outside Advanced', async () => {
    await mount([failed])
    const rec = await screen.findByTestId('l2r-recover')
    expect(rec.closest('[data-testid="advanced-render"]')).toBeNull()
  })
})

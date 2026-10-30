// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { resetStillRecipe } from './stillRecipe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { openingPlan } from './heroCapture'
import { resetCurrentTake, setCurrentTake } from './currentTake'
import { resetSceneJobs } from '../../jobs/sceneJobs'
import { HeroStillBlock } from './HeroStillBlock'
import { heroCredits } from '../../../server/hero/spec'
import { resetClayStore } from './takeClay'
import { BIBLE_CHANGED } from '../scene/bibleApi'
import { base, lab, serve, still, take } from './__tests__/heroStillHarness'
import type {} from '../../shared/stillBible'

beforeEach(() => { vi.useRealTimers(); resetCurrentTake(); resetClayStore(); setCurrentTake('take-1'); sessionStorage.clear() }) // Shoot's lock block locked take-1
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetClayStore(); resetSceneJobs(); resetStillRecipe() }) // a still left drawing by one test is not the next one's

describe('HeroStillBlock', () => {
  it('says "lock a take first" until Shoot locks one; never falls back to the newest take on disk (B3)', async () => {
    resetCurrentTake()
    const s = base({ takes: [take({ id: 'take-other', worldId: 'loc-2' })] }); serve(s)
    render(<HeroStillBlock lab={lab} capture={async () => new Blob(['x'])} />)
    expect((await screen.findByTestId('hero-no-take')).textContent).toMatch(/Lock a take first/)
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByTestId('hero-render')).toBeNull()
    expect(s.calls.filter((c) => c.startsWith('GET /__lab/hero'))).toEqual([])
  })

  it('refuses to render while the set shows another world than the take was locked on, even with its opening uploaded (B3)', async () => {
    const s = base({ opening: { present: true, startKey: 'aaaa0001' } }); serve(s)
    const capture = vi.fn(async () => new Blob(['x']))
    render(<HeroStillBlock lab={{ stage: null, s: { source: 'loc-2' } } as unknown as ProjectionLabState} capture={capture} />)
    const btn = await screen.findByTestId('hero-render') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(screen.getByTestId('hero-blocked').textContent).toMatch(/filmed on another set: switch back/)
    fireEvent.click(btn)
    await new Promise((r) => setTimeout(r, 20))
    expect(capture).not.toHaveBeenCalled(); expect(s.calls.filter((c) => c.startsWith('POST'))).toEqual([])
  })

  it('shows the price before the paid press; the press captures + uploads the opening once, then renders and lists the still', async () => {
    const s = base(); serve(s); const capture = vi.fn(async () => new Blob(['png']))
    render(<HeroStillBlock lab={lab} capture={capture} />)
    const btn = await screen.findByTestId('hero-render')
    expect(btn.parentElement?.textContent).toMatch(new RegExp(`Draw this frame.*${heroCredits(1)} cr`))
    fireEvent.click(screen.getByTestId('hero-count-2'))
    expect(btn.parentElement?.textContent).toMatch(new RegExp(`${heroCredits(2)} cr`))
    fireEvent.click(screen.getByTestId('hero-count-1'))
    fireEvent.click(btn)
    await screen.findByTestId('hero-still-hero-new1')
    expect(capture).toHaveBeenCalledTimes(1)
    expect(s.calls.filter((c) => c.startsWith('POST'))).toEqual(['POST /__lab/hero/opening', 'POST /__lab/hero'])
    fireEvent.click(screen.getByTestId('hero-render')) // the opening is on the server for this start: no second capture
    await waitFor(() => expect(s.calls.filter((c) => c === 'POST /__lab/hero')).toHaveLength(2))
    expect(capture).toHaveBeenCalledTimes(1)
  })

  it('approve marks one still approved; a stale still is badged and cannot be approved', async () => {
    const s = base({ opening: { present: true, startKey: 'aaaa0001' }, stills: [still('hero-b2'), still('hero-a1', { startKey: 'old00000', approved: true })] }); serve(s)
    render(<HeroStillBlock lab={lab} capture={async () => new Blob(['x'])} />)
    await screen.findByTestId('hero-still-hero-b2')
    expect(screen.getByTestId('hero-stale-hero-a1')).toBeTruthy()
    expect(screen.getByTestId('hero-approved-hero-a1')).toBeTruthy() // approved: one state, the label, no live Approve button beside it
    expect(screen.queryByTestId('hero-approve-hero-a1')).toBeNull()
    expect(screen.queryByTestId('hero-stale-hero-b2')).toBeNull()
    fireEvent.click(screen.getByTestId('hero-approve-hero-b2')) // (recipe wave) never from the thumbnail: it opens the still judge
    expect(s.calls).not.toContain('POST /__lab/hero/approve')
    fireEvent.click(await screen.findByTestId('judge-approve'))
    await screen.findByTestId('hero-approved-hero-b2')
    expect(s.calls).toContain('POST /__lab/hero/approve')
  })

  it('F1: a still the server says is behind the Bible is badged with Render\'s reason; a Bible write reads the list again', async () => {
    const s = base({ opening: { present: true, startKey: 'aaaa0001' }, stills: [still('hero-a1', { approved: true })] }); serve(s)
    render(<HeroStillBlock lab={lab} capture={async () => new Blob(['x'])} />)
    await screen.findByTestId('hero-still-hero-a1')
    expect(screen.queryByTestId('hero-stale-hero-a1')).toBeNull()
    s.stills = [still('hero-a1', { approved: true, bibleWhy: "The brief's light changed after this still was drawn" })]
    window.dispatchEvent(new CustomEvent(BIBLE_CHANGED, { detail: 'loc-x' }))
    const badge = await screen.findByTestId('hero-stale-hero-a1')
    expect(badge.getAttribute('title')).toBe("The brief's light changed after this still was drawn")
  })

  it('while a still draws (2-3 minutes) it shows the stage and a running clock, not a bare line', async () => {
    const s = base({ opening: { present: true, startKey: 'aaaa0001' } }); serve(s)
    const served = fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>
    vi.stubGlobal('fetch', vi.fn((u: string, i?: RequestInit) => (u === '/__lab/hero' && i?.method === 'POST' ? new Promise<Response>(() => {}) : served(u, i))))
    render(<HeroStillBlock lab={lab} capture={async () => new Blob(['x'])} />)
    expect(screen.queryByTestId('hero-phase')).toBeNull() // never before a press
    fireEvent.click(await screen.findByTestId('hero-render'))
    const bar = await screen.findByRole('progressbar', { name: 'Rendering the still…' })
    expect(bar.querySelector('.st-progress-time')?.textContent).toMatch(/^\d+:\d{2}$/)
    expect(screen.queryByTestId('hero-render')).toBeNull() // the pill is where the button was
    expect(screen.getByTestId('hero-phase-estimate').textContent).toBe('about 2 to 3 minutes')
    expect(screen.getByTestId('hero-phase-spent').textContent).toMatch(/^≈ [\d.]+ cr spent$/)
  })

  it('opens a still full size in the lightbox and closes it with Escape', async () => {
    serve(base({ opening: { present: true, startKey: 'aaaa0001' }, stills: [still('hero-b2')] }))
    render(<HeroStillBlock lab={lab} capture={async () => new Blob(['x'])} />)
    fireEvent.click(await screen.findByTestId('hero-open-hero-b2'))
    expect((await screen.findByTestId('lightbox-img')).getAttribute('src')).toBe('/lab-assets/shots/take-1/hero/hero-b2.png')
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('lightbox')).toBeNull())
  })

  it('a failed press shows the plain message and a Recover link for the paid job; Recover never renders', async () => {
    const s = base({ opening: { present: true, startKey: 'aaaa0001' }, renderError: { error: 'job abc did not finish; recover by id', code: 'submit', jobId: 'aaaaaaaa-0000-4000-8000-000000000001' } }); serve(s)
    render(<HeroStillBlock lab={lab} capture={async () => new Blob(['x'])} />)
    fireEvent.click(await screen.findByTestId('hero-render'))
    expect((await screen.findByTestId('hero-error')).textContent).toMatch(/recover by id/)
    fireEvent.click(await screen.findByTestId('hero-recover'))
    await waitFor(() => expect(s.calls).toContain('POST /__lab/jobs/recover'))
    expect(s.calls.filter((c) => c === 'POST /__lab/hero')).toHaveLength(1)
  })
})

describe('openingPlan', () => {
  it('is the take\'s frame 0: its start camera at the 16:9 lens, the performance frame it starts on', () => {
    const { frame } = openingPlan(take({ perfStart: 24 }), { fps: 24, frames: 121 })
    expect(frame.position).toEqual([0, 1.6, 4]); expect(frame.t).toBe(1); expect(frame.i).toBe(0)
  })
})

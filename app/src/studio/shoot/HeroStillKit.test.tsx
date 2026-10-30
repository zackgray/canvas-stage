// @vitest-environment jsdom
// The hero still on a kit world (depth-locked Qwen draw + Klein, frames prep, lightbox walk): split from HeroStillBlock.test.tsx.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { resetStillRecipe } from './stillRecipe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HeroStill } from '../../shared/shotContract'
import { resetCurrentTake, setCurrentTake } from './currentTake'
import { resetSceneJobs } from '../../jobs/sceneJobs'
import { HeroStillBlock } from './HeroStillBlock'
import { kitStillCredits } from '../../../server/hero/kitSpec'
import { noteClay, resetClayStore } from './takeClay'
import { base, clayDone, lab, serve, still } from './__tests__/heroStillHarness'

beforeEach(() => { vi.useRealTimers(); resetCurrentTake(); resetClayStore(); setCurrentTake('take-1'); sessionStorage.clear() }) // Shoot's lock block locked take-1
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetClayStore(); resetSceneJobs(); resetStillRecipe() }) // a still left drawing by one test is not the next one's

describe('HeroStillBlock on a kit world (depth-locked Qwen draw + Klein, track B)', () => {
  const kitStills = () => [still('hero-o1', { role: 'opening', frame: 0 } as Partial<HeroStill>), still('hero-m2', { role: 'mid', frame: 60, layout: { score: 0.3, ok: false, message: 'The still doesn\'t match the set (layout 0.30, under 0.38)' } } as Partial<HeroStill>)]
  it('one still per press by default, two on the owner\'s pick (owner 2026-10-25), each choice priced; the keyframe picker shows that keyframe\'s stills and its layout flag', async () => {
    serve(base({ opening: { present: true, startKey: 'aaaa0001' }, stills: kitStills() }))
    render(<HeroStillBlock lab={lab} kit capture={async () => new Blob(['x'])} />)
    const btn = await screen.findByTestId('hero-render')
    expect(btn.parentElement?.textContent).toMatch(new RegExp(`Draw this frame.*${kitStillCredits(1)} cr`))
    expect(screen.getByTestId('hero-count-1').textContent).toBe(`1 still · ${kitStillCredits(1)} cr`)
    expect(screen.getByTestId('hero-count-2').textContent).toBe(`2 stills · ${kitStillCredits(2)} cr`)
    expect(screen.getByTestId('hero-count-1').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByTestId('hero-count-2'))
    expect(btn.parentElement?.textContent).toMatch(new RegExp(`Draw this frame.*${kitStillCredits(2)} cr`))
    fireEvent.click(screen.getByTestId('hero-count-1'))
    expect(btn.parentElement?.textContent).toMatch(new RegExp(`Draw this frame.*${kitStillCredits(1)} cr`))
    await screen.findByTestId('hero-still-hero-o1')
    expect(screen.queryByTestId('hero-still-hero-m2')).toBeNull()
    expect(screen.queryByTestId('hero-layout')).toBeNull()
    fireEvent.click(screen.getByTestId('hero-role-mid'))
    await screen.findByTestId('hero-still-hero-m2')
    expect(screen.queryByTestId('hero-still-hero-o1')).toBeNull()
    expect(screen.getByTestId('hero-layout').textContent).toMatch(/may be missing the hero or have moved part of the set.*compare with the set frame before approving/)
  })
  it('a flagged still: the warning is plain English with Compare beside it; the judge\'s Approve is one plain click, no dialog', async () => {
    const s = base({ opening: { present: true, startKey: 'aaaa0001' }, stills: kitStills(), clay: clayDone() }); serve(s)
    const confirm = vi.fn(() => true); vi.stubGlobal('confirm', confirm)
    render(<HeroStillBlock lab={lab} kit capture={async () => new Blob(['x'])} />)
    await screen.findByTestId('hero-render')
    fireEvent.click(screen.getByTestId('hero-role-mid'))
    const approve = await screen.findByTestId('hero-approve-hero-m2')
    expect(approve.className).toMatch(/st-btn-quiet/)
    expect(screen.getByTestId('hero-check-hero-m2')).toBeTruthy()
    fireEvent.click(approve) // opens the still judge, full size
    const judged = await screen.findByTestId('judge-approve')
    await waitFor(() => expect(judged.textContent).toBe('Approve'))
    expect(screen.getByTestId('judge-layout').textContent).toMatch(/may be missing the hero/)
    fireEvent.click(judged) // one click: the flag is information, never a gate
    expect(screen.queryByTestId('judge-approve-ask')).toBeNull()
    await screen.findByTestId('hero-approved-hero-m2')
    expect(s.calls.filter((c) => c === 'POST /__lab/hero/approve')).toHaveLength(1)
    expect(screen.getByTestId('judge-approved').textContent).toBe('approved')
    expect(screen.getByTestId('lightbox-label').textContent).toMatch(/approved/) // the lightbox caption gains "approved"
    expect(confirm).not.toHaveBeenCalled()
  })
  it('Compare beside the warning opens the still already flipped to the 3D set frame; an unflagged still approves on one click', async () => {
    const s = base({ opening: { present: true, startKey: 'aaaa0001' }, stills: [still('hero-o3', { role: 'opening', frame: 0 } as Partial<HeroStill>), still('hero-m2', { role: 'mid', frame: 56, layout: { score: 0.3, ok: false, message: 'x' } } as Partial<HeroStill>)], clay: clayDone({ frames: 121 }) }); serve(s)
    render(<HeroStillBlock lab={lab} kit capture={async () => new Blob(['x'])} />)
    await screen.findByTestId('hero-render')
    fireEvent.click(await screen.findByTestId('hero-approve-hero-o3')) // the strip fills from its own read, after the press shows
    const judged = await screen.findByTestId('judge-approve')
    await waitFor(() => expect(judged.textContent).toBe('Approve'))
    fireEvent.click(judged) // unflagged: one click in the judge
    await screen.findByTestId('hero-approved-hero-o3')
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByTestId('hero-role-mid'))
    const cmp = await screen.findByTestId('hero-compare-hero-m2')
    fireEvent.click(cmp)
    await screen.findByTestId('lightbox')
    // already on the set frame (the lightbox flips in its own effect, after it shows)
    await waitFor(() => expect(screen.getByTestId('lightbox-compare').getAttribute('aria-pressed')).toBe('true'))
  })
  it('M4: a draw whose finish never ran offers a priced Finish (3 cr) that runs only the finish, never a new draw', async () => {
    const s = base({ stills: kitStills(), unfinished: [{ id: 'hero-d1', role: 'opening', frame: 0, png: '/x/hero-d1-draw.png', createdAt: 't', startKey: 'aaaa0001' }] }); serve(s)
    render(<HeroStillBlock lab={lab} kit capture={async () => new Blob(['x'])} />)
    const btn = await screen.findByTestId('hero-finish')
    expect(screen.getByTestId('hero-unfinished').textContent).toMatch(/never got its finish.*Finish.*3 cr/)
    fireEvent.click(btn)
    await waitFor(() => expect(s.calls).toContain('POST /__lab/hero/finish'))
    const call = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.find(([u]) => u === '/__lab/hero/finish')
    expect(JSON.parse(String(call?.[1].body))).toEqual({ takeId: 'take-1', ids: ['hero-d1'] })
    expect(s.calls).not.toContain('POST /__lab/hero')
    await waitFor(() => expect(screen.queryByTestId('hero-unfinished')).toBeNull())
  })
  it('a mid press sends role "mid" and captures no opening (the clay\'s depth is used)', async () => {
    const s = base({ stills: kitStills(), clay: clayDone() }); serve(s); const capture = vi.fn(async () => new Blob(['x']))
    render(<HeroStillBlock lab={lab} kit capture={capture} />)
    await screen.findByTestId('hero-render')
    fireEvent.click(screen.getByTestId('hero-role-mid'))
    fireEvent.click(screen.getByTestId('hero-render'))
    await waitFor(() => expect(s.calls).toContain('POST /__lab/hero'))
    const call = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.find(([u, i]) => u === '/__lab/hero' && i?.method === 'POST')
    expect(JSON.parse(String(call?.[1].body))).toMatchObject({ takeId: 'take-1', count: 1, role: 'mid', preset: 'photographic' })
    expect(capture).not.toHaveBeenCalled()
  })
  it('the 1-or-2 choice is remembered for the session: a new Shoot screen presses with two until changed back', async () => {
    const s = base({ stills: kitStills(), clay: clayDone() }); serve(s)
    const first = render(<HeroStillBlock lab={lab} kit capture={async () => new Blob(['x'])} />)
    fireEvent.click(await screen.findByTestId('hero-count-2'))
    first.unmount()
    render(<HeroStillBlock lab={lab} kit capture={async () => new Blob(['x'])} />)
    expect((await screen.findByTestId('hero-count-2')).getAttribute('aria-pressed')).toBe('true')
    const btn = screen.getByTestId('hero-render') as HTMLButtonElement
    expect(btn.parentElement?.textContent).toMatch(new RegExp(`${kitStillCredits(2)} cr`))
    await waitFor(() => expect(btn.disabled).toBe(false), { timeout: 3000 })
    fireEvent.click(btn)
    await waitFor(() => expect(s.calls).toContain('POST /__lab/hero'), { timeout: 3000 })
    const call = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.find(([u, i]) => u === '/__lab/hero' && i?.method === 'POST')
    expect(JSON.parse(String(call?.[1].body))).toMatchObject({ count: 2 })
  })
})

describe('a kit still needs the 3D set frames: prepared first, never a paid press without them (QA 2026-10-25)', () => {
  const kitStill = () => [still('hero-o1', { role: 'opening', frame: 0 } as Partial<HeroStill>)]
  it('with no frames the press prepares them first (free), then draws: one paid POST, after the frames exist', async () => {
    const s = base({ opening: { present: true, startKey: 'aaaa0001' }, stills: kitStill() }); serve(s)
    const prepare = vi.fn(async () => { s.calls.push('PREPARE'); const c = clayDone(); s.clay = c; return c as never })
    render(<HeroStillBlock lab={lab} kit capture={async () => new Blob(['x'])} prepare={prepare} />)
    expect((await screen.findByTestId('hero-prep-first')).textContent).toMatch(/prepared first \(free/)
    fireEvent.click(screen.getByTestId('hero-render'))
    await waitFor(() => expect(s.calls).toContain('POST /__lab/hero'))
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(s.calls.indexOf('PREPARE')).toBeLessThan(s.calls.indexOf('POST /__lab/hero'))
  })
  it('the frames could not be prepared: a plain message, and nothing goes to the paid route', async () => {
    const s = base({ opening: { present: true, startKey: 'aaaa0001' }, stills: kitStill() }); serve(s)
    render(<HeroStillBlock lab={lab} kit capture={async () => new Blob(['x'])} prepare={async () => null} />)
    fireEvent.click(await screen.findByTestId('hero-render'))
    expect((await screen.findByTestId('hero-error')).textContent).toMatch(/couldn't be prepared, so nothing was drawn or billed/)
    expect(s.calls.filter((c) => c.startsWith('POST'))).toEqual([])
  })
  it('frames without depth (an old clay) are not enough: they are prepared again before the draw', async () => {
    const s = base({ opening: { present: true, startKey: 'aaaa0001' }, stills: kitStill(), clay: clayDone({ depth: null }) }); serve(s)
    const prepare = vi.fn(async () => null)
    render(<HeroStillBlock lab={lab} kit capture={async () => new Blob(['x'])} prepare={prepare} />)
    fireEvent.click(await screen.findByTestId('hero-render'))
    await screen.findByTestId('hero-error')
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(s.calls).not.toContain('POST /__lab/hero')
  })
  it('the stage cannot prepare them (no stage yet): the press is off and says why; nothing is sent', async () => {
    const s = base({ opening: { present: true, startKey: 'aaaa0001' }, stills: kitStill() }); serve(s)
    render(<HeroStillBlock lab={lab} kit capture={async () => new Blob(['x'])} />)
    const btn = await screen.findByTestId('hero-render') as HTMLButtonElement
    await waitFor(() => expect(screen.getByTestId('hero-blocked').textContent).toMatch(/frames can't be prepared yet: Waiting for the stage/))
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    await new Promise((r) => setTimeout(r, 20))
    expect(s.calls.filter((c) => c.startsWith('POST'))).toEqual([])
  })
  it('the old "needs the frames" warning clears once the frames exist (prepared from the lock block)', async () => {
    const s = base({ opening: { present: true, startKey: 'aaaa0001' }, stills: kitStill(), clay: clayDone(), renderStatus: 409,
      renderError: { error: 'This still is drawn on the 3D set\'s depth at its frame, and those frames are not prepared yet.', code: 'no_depth' } }); serve(s)
    render(<HeroStillBlock lab={lab} kit capture={async () => new Blob(['x'])} />)
    await screen.findByTestId('hero-render')
    await waitFor(() => expect(screen.queryByTestId('hero-blocked')).toBeNull()) // the frames on disk are read: ready
    fireEvent.click(screen.getByTestId('hero-render'))
    await screen.findByTestId('hero-error')
    act(() => noteClay('take-1', null))
    act(() => noteClay('take-1', clayDone({ finishedAt: 'f2' }) as never))
    await waitFor(() => expect(screen.queryByTestId('hero-error')).toBeNull())
  })
})

describe('hero stills open full size: the arrows walk opening, mid and end, Compare flips to the 3D set frame', () => {
  it('opening then mid in the lightbox, each against its own clay frame', async () => {
    const stills = [still('hero-o1', { role: 'opening', frame: 0 } as Partial<HeroStill>), still('hero-m2', { role: 'mid', frame: 56 } as Partial<HeroStill>),
      still('hero-e3', { role: 'end', frame: 120 } as Partial<HeroStill>)]
    serve(base({ opening: { present: true, startKey: 'aaaa0001' }, stills, clay: clayDone() }))
    render(<HeroStillBlock lab={lab} kit capture={async () => new Blob(['x'])} />)
    fireEvent.click(await screen.findByTestId('hero-open-hero-o1'))
    expect(screen.getByTestId('lightbox-label').textContent).toBe('Opening · seed 7 · 1 of 3')
    await waitFor(() => expect(screen.getByTestId('lightbox-compare')).toBeTruthy())
    fireEvent.click(screen.getByTestId('lightbox-compare'))
    expect(screen.getByTestId('lightbox-img').getAttribute('src')).toBe('/lab-assets/shots/take-1/clay/clay-f0.png?v=f1')
    fireEvent.click(screen.getByTestId('lightbox-next'))
    expect(screen.getByTestId('lightbox-label').textContent).toBe('Mid · f56 · seed 7 · 2 of 3')
    fireEvent.click(screen.getByTestId('lightbox-compare'))
    expect(screen.getByTestId('lightbox-img').getAttribute('src')).toBe('/lab-assets/shots/take-1/clay/clay-mid.png?v=f1')
    fireEvent.click(screen.getByTestId('lightbox-next'))
    fireEvent.click(screen.getByTestId('lightbox-compare'))
    expect(screen.getByTestId('lightbox-img').getAttribute('src')).toBe('/lab-assets/shots/take-1/clay/clay-last.png?v=f1')
  })
})

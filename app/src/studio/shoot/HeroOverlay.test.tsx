// @vitest-environment jsdom
// The first-frame window over the viewport (owner 10-29; was Track F's awaiting-still overlay): it opens only when asked (the take
// card's thumbnail, or a draw that lands: setFrameView(id, 'still')), never by itself for an awaiting still; the X and Esc close it;
// a Clay / Still switch swaps the picture for the clay frame the draw was made from. There is no Approve anywhere: the version picked
// in the window is the frame in use (FrameEditDock). The stale rule stays (a stale still never opens it), and one Esc with a
// lightbox open above it closes the lightbox only.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HeroStill } from '../../shared/shotContract'
import { resetCurrentTake, setCurrentTake } from './currentTake'
import { resetSceneJobs } from '../../jobs/sceneJobs'
import { HeroStillBlock } from './HeroStillBlock'
import { HeroOverlay } from './HeroOverlay'
import { useHeroPublished } from './heroPublished'
import { resetFrameView, setFrameView } from './firstFrameView'
import { resetClayStore } from './takeClay'
import { base, clayDone, lab, serve, still } from './__tests__/heroStillHarness'

beforeEach(() => { vi.useRealTimers(); resetCurrentTake(); resetClayStore(); setCurrentTake('take-1'); sessionStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetClayStore(); resetSceneJobs(); resetFrameView() })

const open = (extra: Partial<HeroStill> = {}) => still('hero-o1', { role: 'opening', frame: 0, ...extra } as Partial<HeroStill>)
/** the take's frame as the still block publishes it (what the window opens on) */
function Probe() {
  const o = useHeroPublished()?.overlay ?? null
  return o ? <span data-testid="probe" data-still={o.still.id} data-approved={String(o.approved)} /> : null
}
const Mount = () => <><HeroStillBlock lab={lab} kit capture={async () => new Blob(['x'])} /><HeroOverlay /><Probe /></>
/** the take card's thumbnail: opens the window on the take's frame */
async function openWindow(id = 'hero-o1') {
  await waitFor(() => expect(screen.getByTestId('probe').getAttribute('data-still')).toBe(id))
  act(() => setFrameView(id, 'still'))
  return screen.findByTestId('hero-overlay')
}
const approveButtons = (root: HTMLElement) => [...root.querySelectorAll('button')]
  .filter((b) => /approve/i.test(b.textContent ?? '') || /approve/i.test(b.getAttribute('aria-label') ?? ''))

describe('the hero still over the viewport', () => {
  it('an awaiting still opens no window by itself; opened, it shows the still with the Clay / Still switch and the X, and no Approve', async () => {
    const s = base({ opening: { present: true, startKey: 'aaaa0001' }, stills: [open()], clay: clayDone() }); serve(s)
    render(<Mount />)
    await waitFor(() => expect(screen.getByTestId('probe').getAttribute('data-approved')).toBe('false'))
    expect(screen.queryByTestId('hero-overlay')).toBeNull() // closed until asked (frameViewOf defaults to 3D)
    const win = await openWindow()
    expect(screen.getByTestId('hero-overlay-img').getAttribute('src')).toBe('/lab-assets/shots/take-1/hero/hero-o1.png')
    for (const gone of ['hero-overlay-line', 'hero-overlay-redraw', 'hero-overlay-adjust', 'hero-overlay-people', 'hero-overlay-approve', 'frame-view', 'frame-pick']) {
      expect(screen.queryByTestId(gone)).toBeNull()
    }
    expect(screen.getByTestId('frame-picture')).toBeTruthy()
    expect(screen.getByTestId('hero-overlay-close')).toBeTruthy()
    expect(approveButtons(win)).toEqual([])
    expect(s.calls).not.toContain('POST /__lab/hero/approve') // nothing approved by opening it
  })

  it('the Clay / Still switch swaps the picture for the clay frame the draw was made from, and back', async () => {
    serve(base({ opening: { present: true, startKey: 'aaaa0001' }, stills: [open()], clay: clayDone() }))
    render(<Mount />)
    await openWindow()
    const img = () => screen.getByTestId('hero-overlay-img')
    expect(img().getAttribute('src')).toBe('/lab-assets/shots/take-1/hero/hero-o1.png')
    fireEvent.click(screen.getByTestId('frame-picture-clay'))
    expect(img().getAttribute('src')).toBe('/lab-assets/shots/take-1/clay/clay-f0.png?v=hero-o1')
    fireEvent.click(screen.getByTestId('frame-picture-still'))
    expect(img().getAttribute('src')).toBe('/lab-assets/shots/take-1/hero/hero-o1.png')
  })

  it('X and Esc close the window; setFrameView opens it again, the still still with the take', async () => {
    serve(base({ opening: { present: true, startKey: 'aaaa0001' }, stills: [open()], clay: clayDone() }))
    render(<Mount />)
    await openWindow()
    fireEvent.click(screen.getByTestId('hero-overlay-close'))
    expect(screen.queryByTestId('hero-overlay')).toBeNull()
    act(() => setFrameView('hero-o1', 'still'))
    expect(await screen.findByTestId('hero-overlay')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('hero-overlay')).toBeNull()
    act(() => setFrameView('hero-o1', 'still'))
    expect((await screen.findByTestId('hero-overlay-img')).getAttribute('src')).toBe('/lab-assets/shots/take-1/hero/hero-o1.png')
  })

  // review F3: one approved opening still per take; once there is one, no sibling or leftover covers the viewport
  it('a take opened with an approved opening still and leftover unapproved siblings opens no window and offers no Approve', async () => {
    serve(base({ opening: { present: true, startKey: 'aaaa0001' }, clay: clayDone(),
      stills: [open({ approved: true }), still('hero-o2', { role: 'opening', frame: 0 } as Partial<HeroStill>), still('hero-o3', { role: 'opening', frame: 0 } as Partial<HeroStill>)] }))
    render(<Mount />)
    await screen.findByTestId('hero-still-hero-o3')
    expect(screen.queryByTestId('hero-overlay')).toBeNull()
    expect(screen.queryByTestId('hero-overlay-approve')).toBeNull()
  })

  it('a stale still is not offered, and a mid keyframe still never opens the overlay', async () => {
    serve(base({ opening: { present: true, startKey: 'aaaa0001' }, stills: [open({ startKey: 'zzzz9999' }), still('hero-m2', { role: 'mid', frame: 60 } as Partial<HeroStill>)], clay: clayDone() }))
    render(<Mount />)
    await screen.findByTestId('hero-stale-hero-o1') // the strip says stale; the viewport does not ask about it
    expect(screen.queryByTestId('hero-overlay')).toBeNull()
  })

  // review F12: one Esc closes the lightbox opened above the overlay, and only that
  it('Esc with a lightbox open above the overlay closes the lightbox and leaves the still up', async () => {
    serve(base({ opening: { present: true, startKey: 'aaaa0001' }, stills: [open()], clay: clayDone() }))
    render(<Mount />)
    await openWindow()
    fireEvent.click(await screen.findByTestId('hero-open-hero-o1'))
    await screen.findByTestId('lightbox')
    for (const target of [window, document.body] as const) {
      fireEvent.keyDown(target, { key: 'Escape' })
      await waitFor(() => expect(screen.queryByTestId('lightbox')).toBeNull())
      expect(screen.getByTestId('hero-overlay')).toBeTruthy()
      if (target === window) { fireEvent.click(screen.getByTestId('hero-open-hero-o1')); await screen.findByTestId('lightbox') }
    }
  })
})

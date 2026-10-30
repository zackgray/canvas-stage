// @vitest-environment jsdom
// (owner 10-29) The first-frame window covers the WHOLE viewport while it is open, with the Camera pane on or off: it holds the
// look and the render now, so it takes the room. This deliberately reverses review F7 (wave 3), which laid the bare still on the
// Camera pane alone. The window opens only when asked (setFrameView(id, 'still')) and is closed otherwise.
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { publishHero, type HeroOverlayModel, type HeroPublished } from '../../../../studio/shoot/heroPublished'
import { resetFrameView, setFrameView } from '../../../../studio/shoot/firstFrameView'
import type { ProjectionLabState } from '../../useProjectionLab'
import { LabViewport } from '../LabViewport'

afterEach(() => { cleanup(); act(() => publishHero(null)); resetFrameView() })

/** the left half of a 1260x680 canvas split Camera + Free, fitted to the export frame */
const CAMERA = { x: 0, y: 162, w: 630, h: 357 }
function lab(): ProjectionLabState {
  const canvas = document.createElement('canvas')
  Object.defineProperty(canvas, 'clientWidth', { value: 1260 })
  Object.defineProperty(canvas, 'clientHeight', { value: 680 })
  const stage = { renderer: { domElement: canvas }, panes: { rect: (p: string) => (p === 'camera' ? CAMERA : null) } }
  return { host: { current: null }, op: { mode: 'free', engine: {} }, stage, kit: { id: 'loc-a', perf: null }, angle: 0 } as unknown as ProjectionLabState
}
/** a first frame waiting to be picked, and its window opened (the take card's thumbnail) */
function showStill(open = true) {
  const overlay = { still: { id: 'hero-o1', png: '/o1.png', stale: false }, approved: false, redrawPrice: 3, running: false, error: null,
    onApprove: () => {}, onRedraw: () => {}, onChanged: () => {} } as unknown as HeroOverlayModel
  act(() => publishHero({ prompt: {} as HeroPublished['prompt'], overlay, press: null }))
  if (open) act(() => setFrameView('hero-o1', 'still'))
}

describe('the first frame over the viewport', () => {
  it('Camera + Free: the open window covers the whole viewport, never only the Camera pane (F7 reversed)', () => {
    showStill()
    render(<LabViewport lab={lab()} camera />)
    const box = screen.getByTestId('hero-overlay').parentElement!
    expect(box.getAttribute('data-testid')).not.toBe('camera-pane-box')
    expect(box.className).toBe('pl-viewport')
  })
  it('closed until asked: an awaiting still alone opens no window', () => {
    showStill(false)
    render(<LabViewport lab={lab()} camera />)
    expect(screen.queryByTestId('hero-overlay')).toBeNull()
  })
  it('the Camera pane off: it fills the viewport', () => {
    showStill()
    render(<LabViewport lab={lab()} camera={false} />)
    expect(screen.getByTestId('hero-overlay').parentElement!.className).toBe('pl-viewport')
  })
})

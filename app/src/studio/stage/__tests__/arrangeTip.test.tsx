// @vitest-environment jsdom
// The arranging tip (layout wave L4; W3-E2 words): the small dismissible pill in the top-right of the viewport's large pane —
// "Click anything to change it · right-click for its menu" — dismissed for the session. It sits in the first Free/Top pane, never in
// the Camera pane (whose own hint shows there), so the two pills never overlap; the pick-pipeline half of "✕ never marks a spot"
// lives in stagePickDrag.test.tsx, through the real useStagePick on a real canvas.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Stage } from '../../../labs/projection/engine/Stage'
import { ArrangeTip } from '../ArrangeTip'

afterEach(() => { cleanup(); sessionStorage.clear(); vi.restoreAllMocks() })

const TIP = 'Click anything to change it · right-click for its menu'

/** a stage whose pane rect is known: the pill lands in the large pane's top-right corner */
function stage(rect: { x: number; y: number; w: number; h: number }, active = ['camera', 'free', 'top']): Stage {
  const canvas = document.createElement('canvas')
  Object.defineProperty(canvas, 'clientWidth', { value: 1000, configurable: true })
  Object.defineProperty(canvas, 'clientHeight', { value: 600, configurable: true })
  return {
    renderer: { domElement: canvas },
    panes: { active, rect: (p: string) => (active.includes(p) ? rect : null), slot: (p: string) => (active.includes(p) ? rect : null),
      split: () => active.length > 1, focused: active[0] },
  } as unknown as Stage
}

describe('the arranging tip (L4)', () => {
  it('shows the mock\'s line in the top-right of the large pane, with a ✕', () => {
    render(<ArrangeTip stage={stage({ x: 0, y: 0, w: 500, h: 600 })} show />)
    const tip = screen.getByTestId('stage-tip')
    expect(tip.textContent).toContain(TIP)
    expect(screen.getByTestId('stage-tip-dismiss')).toBeTruthy()
    // jsdom measures the pill at 0 wide: left = the pane's right edge - 8, top = its top + 6 (CameraHint's own corner math)
    expect(tip.style.left).toBe('492px')
    expect(tip.style.top).toBe('6px')
  })

  it('✕ dismisses it for the session: it stays gone on a remount', () => {
    const { unmount } = render(<ArrangeTip stage={stage({ x: 0, y: 0, w: 500, h: 600 })} show />)
    fireEvent.click(screen.getByTestId('stage-tip-dismiss'))
    expect(screen.queryByTestId('stage-tip')).toBeNull()
    expect(sessionStorage.getItem('canvas-stage.arrangeTip')).toBe('1')
    unmount()
    render(<ArrangeTip stage={stage({ x: 0, y: 0, w: 500, h: 600 })} show />)
    expect(screen.queryByTestId('stage-tip')).toBeNull() // the session remembers
  })

  it('split panes are two viewports: each its own frame and name, the pressed one lit; one pane on draws no frames', () => {
    const slots: Record<string, { x: number; y: number; w: number; h: number }> = {
      camera: { x: 0, y: 0, w: 500, h: 600 }, free: { x: 500, y: 0, w: 500, h: 600 },
    }
    const s = {
      renderer: { domElement: Object.assign(document.createElement('canvas'), {}) },
      panes: { active: ['camera', 'free'], rect: (p: string) => slots[p] ?? null, slot: (p: string) => slots[p] ?? null, split: () => true, focused: 'free' },
    } as unknown as Stage
    const { unmount } = render(<ArrangeTip stage={s} show />)
    const cam = screen.getByTestId('stage-pane-frame-camera'), free = screen.getByTestId('stage-pane-frame-free')
    expect([cam.style.display, cam.style.left, cam.style.width]).toEqual(['', '0px', '500px'])
    expect([free.style.display, free.style.left, free.style.width]).toEqual(['', '500px', '500px'])
    expect(screen.getByTestId('stage-pane-frame-top').style.display).toBe('none')
    expect(cam.textContent).toBe('Camera')
    expect(free.textContent).toBe('Free view')
    expect(free.classList.contains('st-pane-frame-on')).toBe(true)
    expect(cam.classList.contains('st-pane-frame-on')).toBe(false)
    unmount()
    render(<ArrangeTip stage={stage({ x: 0, y: 0, w: 500, h: 600 }, ['camera'])} show />)
    expect(screen.getByTestId('stage-pane-frame-camera').style.display).toBe('none')
    expect(screen.getByTestId('stage-frame-guide').style.display).toBe('') // the export frame's outline stays
  })

  it('hidden while the operator drives — the Camera hint\'s slot — so the two pills never overlap', () => {
    const { rerender } = render(<ArrangeTip stage={stage({ x: 0, y: 0, w: 500, h: 600 })} show={false} />)
    expect(screen.queryByTestId('stage-tip')).toBeNull()
    rerender(<ArrangeTip stage={stage({ x: 0, y: 0, w: 500, h: 600 })} show />)
    expect(screen.getByTestId('stage-tip')).toBeTruthy()
    rerender(<ArrangeTip stage={stage({ x: 0, y: 0, w: 500, h: 600 }, ['camera'])} show />)
    expect(screen.getByTestId('stage-tip').style.display).toBe('none')
  })
})

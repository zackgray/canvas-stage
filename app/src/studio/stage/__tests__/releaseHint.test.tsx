// @vitest-environment jsdom
// The Camera's release hint (FrameGuide): while the Camera holds the mouse a small tag says Esc, or the controller's Create, lets go;
// it is on screen for as long as the mouse is held and gone once released. It never mentions focus (there is none to set).
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Stage } from '../../../labs/projection/engine/Stage'
import { FrameGuide, RELEASE_HINT } from '../FrameGuide'

afterEach(() => { cleanup(); lockedTo(null) })

const frame = { x: 0, y: 0, w: 100, h: 60 }
function fakeStage(canvas: HTMLCanvasElement) {
  return { renderer: { domElement: canvas }, panes: { rect: () => frame, slot: () => frame, split: () => false, focused: 'camera' } } as unknown as Stage
}
const lockedTo = (el: Element | null) => Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: el }) // jsdom has none

describe('the Camera release hint', () => {
  it('names Esc and Create, with no word about focus', () => {
    expect(RELEASE_HINT).toBe('Esc to release · Create on the controller')
    expect(RELEASE_HINT).not.toMatch(/focus/i)
  })

  it('shows while the Camera holds the mouse, and goes when it is released', async () => {
    const canvas = document.createElement('canvas')
    document.body.appendChild(canvas)
    const frames = new Map<number, () => void>()
    let n = 0
    vi.stubGlobal('requestAnimationFrame', (f: () => void) => { frames.set(++n, f); return n })
    vi.stubGlobal('cancelAnimationFrame', (i: number) => frames.delete(i))
    const step = () => act(() => { const f = [...frames.values()]; frames.clear(); f.forEach((g) => g()) })
    render(<FrameGuide stage={fakeStage(canvas)} />)
    const tag = screen.getByTestId('camera-release-hint')
    const shown = () => (tag.parentElement as HTMLElement).style.display !== 'none'
    lockedTo(null); step()
    expect(shown()).toBe(false)
    lockedTo(canvas); step()
    expect(shown()).toBe(true)
    expect(tag.textContent).toBe(RELEASE_HINT)
    step(); expect(shown()).toBe(true) // kept on screen the whole time it is held
    lockedTo(null); step()
    expect(shown()).toBe(false)
    vi.unstubAllGlobals()
  })
})

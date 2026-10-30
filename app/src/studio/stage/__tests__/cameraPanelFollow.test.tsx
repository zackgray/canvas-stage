// @vitest-environment jsdom
// With several panes up the right panel follows the pane the last press landed in (the Camera's own panel while it is the
// Camera, the set panel for a Free or Top pane); a pane that is off is never the answer.
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Stage } from '../../../labs/projection/engine/Stage'
import type { PaneId } from '../../../labs/projection/engine/panes'
import { useCameraPanel } from '../useCameraPanel'

afterEach(cleanup)

/** a stage whose canvas sits at the origin and whose pane under a press is the one the test names */
function fakeStage(under: { at: PaneId }) {
  const canvas = document.createElement('canvas')
  return { renderer: { domElement: canvas }, panes: { at: () => under.at } } as unknown as Stage
}
const press = (s: Stage) => act(() => { s.renderer.domElement.dispatchEvent(new Event('pointerdown')) })

describe('useCameraPanel', () => {
  it('the Camera alone: the Camera panel; Free and Top without the Camera: never', () => {
    const s = fakeStage({ at: 'camera' })
    expect(renderHook(() => useCameraPanel(s, ['camera'])).result.current).toBe(true)
    expect(renderHook(() => useCameraPanel(s, ['free', 'top'])).result.current).toBe(false)
  })

  it('Camera beside the Free view: the Camera panel until a press lands in the Free view, and again after one in the Camera', () => {
    const under = { at: 'camera' as PaneId }
    const s = fakeStage(under)
    const { result } = renderHook(() => useCameraPanel(s, ['camera', 'free']))
    expect(result.current).toBe(true)
    under.at = 'free'; press(s)
    expect(result.current).toBe(false)
    under.at = 'camera'; press(s)
    expect(result.current).toBe(true)
  })

  it('a last press in a pane that has since been turned off falls back to the Camera', () => {
    const under = { at: 'top' as PaneId }
    const s = fakeStage(under)
    const { result, rerender } = renderHook(({ on }) => useCameraPanel(s, on), { initialProps: { on: ['camera', 'top'] as PaneId[] } })
    press(s)
    expect(result.current).toBe(false)
    rerender({ on: ['camera', 'free'] })
    expect(result.current).toBe(true)
  })
})

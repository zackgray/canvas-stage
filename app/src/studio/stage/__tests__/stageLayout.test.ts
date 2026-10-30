// The layout at 1440 and 900 wide, verified by structure (layout wave L4): the right panel is a fixed track off a CSS variable
// the panes never read; the option rail and the arrange tip are absolutely positioned overlays inside the viewport, so opening
// either can never move or resize a pane — the pane split is Panes.rects' own pure function of the viewport's size. These tests
// pin that structure: exact pane rectangles at both widths, and the stylesheet rules that keep the overlays out of every track.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Panes, type PaneId } from '../../../labs/projection/engine/panes'

/** the pure half of Panes: rects() reads only the active list — no renderer, no canvas, no rail */
const panes = (on: PaneId[]): Panes => {
  const p = Object.create(Panes.prototype) as Panes
  p.set(on)
  return p
}
const css = (file: string) => readFileSync(file, 'utf8')
const rule = (file: string, sel: string) => css(file).match(new RegExp(`${sel.replace('.', '\\.')} \\{[^}]*\\}`))?.[0] ?? ''

describe('the layout at 1440 and 900 wide (L4)', () => {
  it('the pane split is a pure function of the viewport size: the Camera keeps the left half at both widths, with or without the rail', () => {
    // the rail and the tip know nothing about Panes and Panes knows nothing about them: the same rectangles come out whether
    // or not an overlay is open, so an overlay can never reflow a pane
    expect(panes(['camera', 'free', 'top']).rects(1440, 800)).toEqual([
      { pane: 'camera', rect: { x: 0, y: 0, w: 720, h: 800 } },
      { pane: 'free', rect: { x: 720, y: 0, w: 720, h: 400 } },
      { pane: 'top', rect: { x: 720, y: 400, w: 720, h: 400 } },
    ])
    expect(panes(['camera', 'free', 'top']).rects(900, 500)).toEqual([
      { pane: 'camera', rect: { x: 0, y: 0, w: 450, h: 500 } },
      { pane: 'free', rect: { x: 450, y: 0, w: 450, h: 250 } },
      { pane: 'top', rect: { x: 450, y: 250, w: 450, h: 250 } },
    ])
    expect(panes(['camera', 'free']).rects(1440, 800)).toEqual([
      { pane: 'camera', rect: { x: 0, y: 0, w: 720, h: 800 } },
      { pane: 'free', rect: { x: 720, y: 0, w: 720, h: 800 } },
    ])
    expect(panes(['camera', 'free']).rects(900, 500)).toEqual([
      { pane: 'camera', rect: { x: 0, y: 0, w: 450, h: 500 } },
      { pane: 'free', rect: { x: 450, y: 0, w: 450, h: 500 } },
    ])
  })

  it('the right panel is a fixed track of its own variable; the viewport ends at it — at any width', () => {
    const vp = rule('src/studio/screens/screens.css', '.st-vp')
    expect(vp).toContain('position: absolute')
    expect(vp).toContain('right: var(--st-shoot-w, 340px)')
    const screen = rule('src/studio/screens/screens.css', '.st-screen-stage')
    expect(screen).toContain('width: var(--st-shoot-w, 340px)') // the panel never reads the rail or the tip
  })

  it('the rail and the tip overlay: both are absolutely positioned, outside every layout track', () => {
    const rail = rule('src/studio/stage/stage.css', '.st-rail')
    expect(rail).toContain('position: absolute')
    expect(rail).toContain('left: 0')
    const tip = rule('src/labs/projection/projection.css', '.pl-tip')
    expect(tip).toContain('position: absolute')
  })
})

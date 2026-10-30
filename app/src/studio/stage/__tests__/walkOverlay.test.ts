// @vitest-environment jsdom
// The walk to a spot on the viewport: while WalkTo publishes a walk, every pane on shows a dashed line from her start along the path
// and a ring on the ground at the spot, projected through that pane's camera and laid on that pane's picture; no walk, nothing.
// A real perspective camera over a fake canvas (jsdom has no GL); the overlay is DOM only.
import { afterEach, describe, expect, it } from 'vitest'
import { PerspectiveCamera } from 'three'
import type { Stage } from '../../../labs/projection/engine/Stage'
import type { PaneId } from '../../../labs/projection/engine/panes'
import { setWalkHot, setWalkMarks, sampleWalk } from '../walkMarks'
import { mountWalkOverlay, pathD } from '../walkOverlay'

afterEach(() => { setWalkMarks(null); setWalkHot(null); document.body.innerHTML = '' })

/** a camera 1.6 m up at z = 6 looking down -z, drawn in a 400x200 picture at (0, 25) of a 400x250 canvas */
function stage(on: PaneId[] = ['camera']) {
  const canvas = document.createElement('canvas')
  Object.defineProperty(canvas, 'clientWidth', { value: 400 })
  Object.defineProperty(canvas, 'clientHeight', { value: 250 })
  const host = document.createElement('div')
  host.appendChild(canvas)
  document.body.appendChild(host)
  const cam = new PerspectiveCamera(60, 2, 0.05, 500)
  cam.position.set(0, 1.6, 6)
  cam.lookAt(0, 0, 0)
  const s = {
    renderer: { domElement: canvas },
    panes: { rect: (p: PaneId) => (on.includes(p) ? { x: 0, y: 25, w: 400, h: 200 } : null), camera: () => cam },
  } as unknown as Stage
  return { s, host }
}

const svgOf = (pane: string) => document.querySelector(`[data-testid="stage-walk-${pane}"]`) as SVGSVGElement | null

describe('the walk on the viewport', () => {
  it('no walk: nothing drawn; a walk: the line from her start and the ring at the spot, on the pane\'s picture', () => {
    const { s } = stage()
    const o = mountWalkOverlay(s, () => () => 0)
    o.place()
    expect(svgOf('camera')).toBeNull()
    setWalkMarks([[0, 2], [1.5, -2]])
    o.place()
    const svg = svgOf('camera')!
    expect(svg.style.display).toBe('')
    expect(svg.style.top).toBe('25px') // laid on the Camera's picture, not its bars
    expect(svg.getAttribute('width')).toBe('400')
    const d = svg.querySelector('path')!.getAttribute('d')!
    expect(d.startsWith('M')).toBe(true)
    expect(d.split('L').length).toBeGreaterThan(10) // resampled along the leg, so it follows the ground
    expect(svg.querySelector('polygon')!.getAttribute('points')!.split(' ').length).toBe(24) // the spot's ring
    const start = svg.querySelector('circle')!
    expect(Number(start.getAttribute('cx'))).toBeCloseTo(200, 0) // her start is dead ahead: mid-frame
    setWalkMarks(null)
    o.place()
    expect(svg.style.display).toBe('none')
    o.remove()
    expect(svgOf('camera')).toBeNull()
  })

  it('draws in every pane on, and only those', () => {
    const { s } = stage(['camera', 'free'])
    const o = mountWalkOverlay(s, () => () => 0)
    setWalkMarks([[0, 2], [1, 0]])
    o.place()
    expect(svgOf('camera')).not.toBeNull()
    expect(svgOf('free')).not.toBeNull()
    expect(svgOf('top')).toBeNull()
  })

  it('a spot behind the lens: the line breaks there instead of folding back across the frame, and no ring is drawn', () => {
    const { s } = stage()
    const o = mountWalkOverlay(s, () => () => 0)
    setWalkMarks([[0, 2], [0, 12]]) // walks past the camera (z = 6) and on behind it
    o.place()
    const svg = svgOf('camera')!
    expect(svg.querySelector('polygon')!.getAttribute('points')).toBe('')
    expect(svg.querySelector('path')!.getAttribute('d')!.match(/M/g)!.length).toBe(1)
  })

  it('the armed pick\'s band (walk-tool-hot-state): a rubber line from her place and a ring at the spot, without any walk set', () => {
    const { s } = stage()
    const o = mountWalkOverlay(s, () => () => 0)
    setWalkHot({ from: [0, 2], to: [1.5, -2] })
    o.place()
    const svg = svgOf('camera')!
    expect(svg.style.display).toBe('')
    const paths = svg.querySelectorAll('path')
    expect(paths[0].getAttribute('d')).toBe('') // no walk yet: only the band
    expect(paths[1].getAttribute('d')).toMatch(/^M-?[\d.]+,-?[\d.]+ L-?[\d.]+,-?[\d.]+$/)
    const spots = svg.querySelectorAll('polygon')
    expect(spots[0].getAttribute('points')).toBe('')
    expect(spots[1].getAttribute('points')!.split(' ').length).toBe(24) // the ring at the spot under the mouse
    setWalkHot(null) // the tool ends (or Esc): the band clears
    o.place()
    expect(svg.style.display).toBe('none')
  })

  it('the band\'s line hides while the cursor is off the ground, the ring with it; the walk still draws', () => {
    const { s } = stage()
    const o = mountWalkOverlay(s, () => () => 0)
    setWalkMarks([[0, 2], [1, 0]])
    setWalkHot({ from: [0, 2], to: null })
    o.place()
    const svg = svgOf('camera')!
    expect(svg.querySelectorAll('path')[0].getAttribute('d')).not.toBe('') // the walk's line
    expect(svg.querySelectorAll('path')[1].getAttribute('d')).toBe('') // no spot under the mouse: no band
    expect(svg.querySelectorAll('polygon')[1].getAttribute('points')).toBe('')
  })
})

describe('walk marks maths', () => {
  it('sampleWalk keeps the corners and steps a quarter metre between them', () => {
    const s = sampleWalk([[0, 0], [1, 0], [1, 0.5]])
    expect(s[0]).toEqual([0, 0])
    expect(s).toContainEqual([1, 0])
    expect(s[s.length - 1]).toEqual([1, 0.5])
    expect(s.length).toBe(1 + 4 + 2)
  })
  it('pathD lifts the pen over a point behind the lens', () => {
    expect(pathD([[0, 0], [1, 1], null, [2, 2], [3, 3]])).toBe('M0,0 L1,1 M2,2 L3,3')
  })
})

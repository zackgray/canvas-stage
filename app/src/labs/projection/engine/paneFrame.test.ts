// The Camera pane shows exactly the export frame (1920x1088): letterboxed or pillarboxed inside its slot, so the aspect the take
// records equals the export's and nothing at the sides is seen but never drawn.
import { describe, expect, it } from 'vitest'
import { EXPORT_ASPECT, fitAspect, Panes } from './panes'

describe('fitAspect', () => {
  it('pillarboxes a wide-short slot... and letterboxes a tall one, centred, never larger than the slot', () => {
    expect(fitAspect({ x: 0, y: 0, w: 1000, h: 400 }, 2)).toEqual({ x: 100, y: 0, w: 800, h: 400 })
    expect(fitAspect({ x: 10, y: 20, w: 1000, h: 1000 }, 2)).toEqual({ x: 10, y: 270, w: 1000, h: 500 })
    expect(fitAspect({ x: 0, y: 0, w: 1920, h: 1088 }, EXPORT_ASPECT)).toEqual({ x: 0, y: 0, w: 1920, h: 1088 })
  })
})

describe('Panes with a frame aspect', () => {
  const bare = () => Object.create(Panes.prototype) as Panes
  it('fits only the Camera pane; the others keep their whole slots; unset leaves every rect as before', () => {
    const p = bare()
    Object.assign(p, { on: ['camera', 'free', 'top'] })
    const plain = p.rects(1440, 800)
    p.frameAspect = EXPORT_ASPECT
    const fitted = p.rects(1440, 800)
    expect(fitted[1]).toEqual(plain[1]); expect(fitted[2]).toEqual(plain[2])
    const cam = fitted[0].rect
    expect(cam.w / cam.h).toBeCloseTo(EXPORT_ASPECT, 2)
    expect(cam.w).toBeLessThanOrEqual(plain[0].rect.w); expect(cam.h).toBeLessThanOrEqual(plain[0].rect.h)
  })
  it('a lone Camera pane on a wide or a tall viewport is exactly the export aspect', () => {
    const p = bare()
    Object.assign(p, { on: ['camera'], frameAspect: EXPORT_ASPECT })
    for (const [w, h] of [[2400, 800], [900, 900], [1200, 1100]]) {
      const r = p.rects(w, h)[0].rect
      expect(Math.abs(r.w / r.h - EXPORT_ASPECT)).toBeLessThan(0.01)
    }
  })
})

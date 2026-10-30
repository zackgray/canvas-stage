// @vitest-environment jsdom
// The orbit-pivot marker: it shows only while the user is orbiting (the controls' start/end) or when a pivot is placed
// (double-click, an armed pick, the operator's Orbit rig). On bare ground with nothing placed it stays hidden, where it
// read as a stray dot.
import { PerspectiveCamera, Vector3 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Pivot } from './pivot'

function rig() {
  const canvas = document.createElement('canvas')
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 400, height: 250, right: 400, bottom: 250, x: 0, y: 0 } as DOMRect)
  const view = new PerspectiveCamera(40, 400 / 250, 0.05, 100)
  view.position.set(4, 3, 6)
  view.lookAt(0, 0, -4)
  const controls = new OrbitControls(view, canvas)
  const pivot = new Pivot(view, controls, canvas, () => [])
  return { pivot, controls, canvas }
}
const rigs: { pivot: Pivot; controls: OrbitControls; canvas: HTMLCanvasElement }[] = []
afterEach(() => { while (rigs.length) { const r = rigs.pop()!; r.pivot.dispose(); r.controls.dispose() } vi.restoreAllMocks() })
const one = () => { const r = rig(); rigs.push(r); return r }

describe('the pivot marker', () => {
  it('starts hidden and stays hidden when the pivot only moves to the frame centre', () => {
    const { pivot } = one()
    pivot.update()
    expect(pivot.marker.visible).toBe(false)
    pivot.set(new Vector3(0, 0, -4))
    pivot.update()
    expect(pivot.marker.visible).toBe(false) // nobody placed it and nobody is orbiting
  })

  it('shows while orbiting, and hides again when the drag ends', () => {
    const { pivot, controls } = one()
    controls.dispatchEvent({ type: 'start' })
    pivot.update()
    expect(pivot.marker.visible).toBe(true)
    controls.dispatchEvent({ type: 'end' })
    pivot.update()
    expect(pivot.marker.visible).toBe(false)
  })

  it('shows once the user places it, until the placement is cleared', () => {
    const { pivot } = one()
    pivot.setManual(new Vector3(1, 0, -5))
    pivot.update()
    expect(pivot.marker.visible).toBe(true)
    pivot.setManual(null)
    pivot.update()
    expect(pivot.marker.visible).toBe(false)
  })
})

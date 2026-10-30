// @vitest-environment jsdom
// QA 2026-10-25: Blocking's "click the ground" worked only on the small map. A click (not a drag) on the 3D view lands on the
// kit world's ground and becomes a top-view point; the sky and drags do nothing.
import { fireEvent, render } from '@testing-library/react'
import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { Stage } from '../../../../../labs/projection/engine/Stage'
import { groundHit, useGroundClick } from '../groundClick'

describe('groundHit', () => {
  it('lands on flat ground where the ray meets it, on rolling ground at the height under the hit, never on the sky', () => {
    expect(groundHit(new Vector3(0, 2, 0), new Vector3(0, -1, -1).normalize(), () => 0)).toEqual([0, -2])
    const hill = (x: number, z: number) => 0.1 * Math.abs(z) + 0 * x
    const p = groundHit(new Vector3(0, 3, 0), new Vector3(0, -1, -1).normalize(), hill)!
    expect(p[1]).toBeCloseTo(-3 / 1.1, 2)
    expect(groundHit(new Vector3(0, 2, 0), new Vector3(0, 0.2, -1).normalize(), () => 0)).toBeNull()
  })
})

function Probe({ stage, onPoint }: { stage: Stage; onPoint: (p: [number, number]) => void }) {
  useGroundClick(stage, onPoint)
  return null
}

describe('useGroundClick', () => {
  it('a click on the canvas gives the ground point under it; a drag (the orbit camera) gives none', () => {
    const canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 200, height: 100 } as DOMRect)
    const view = new PerspectiveCamera(60, 2, 0.1, 1000)
    view.position.set(0, 2, 5); view.lookAt(0, 0, 0); view.updateMatrixWorld(true)
    const stage = { renderer: { domElement: canvas }, view, kit: { groundAt: () => 0 } } as unknown as Stage
    const onPoint = vi.fn()
    render(<Probe stage={stage} onPoint={onPoint} />)
    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 50 })
    fireEvent.click(canvas, { clientX: 100, clientY: 50 })
    expect(onPoint).toHaveBeenCalledTimes(1)
    const [x, z] = onPoint.mock.calls[0][0]
    expect(x).toBeCloseTo(0, 2); expect(z).toBeCloseTo(0, 2) // the frame centre looks at the origin
    fireEvent.pointerDown(canvas, { clientX: 20, clientY: 50 })
    fireEvent.click(canvas, { clientX: 120, clientY: 50 })
    expect(onPoint).toHaveBeenCalledTimes(1)
  })
})

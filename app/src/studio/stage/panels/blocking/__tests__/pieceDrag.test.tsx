// @vitest-environment jsdom
// (recipe wave) Set pieces dragged in Blocking's top view: a drag moves `at` (mapped through the drawing's viewBox and
// letterbox), the knob or [ / ] turn yawDeg, each change saved once to the plan (a narrow move), and none of it adds a path point.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ScenePlan } from '../../../../../stage3d/contract'
import { BlockingTopView } from '../BlockingTopView'
import { viewBox } from '../blockingMath'
import { PieceDragLayer } from '../PieceDragLayer'
import { yawToward } from '../usePieceDrag'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
const W = 'loc-2026-10-24T20-00-00-000'
const plan: ScenePlan = { seed: 1, sky: { url: '/lab-assets/sky/procedural' }, kit: [
  { kind: 'barrels', at: [6, -8] },
  { kind: 'steam locomotive', at: [-9, -14], yawDeg: 0, pieceTag: 'prop:engine', glb: { url: `/lab-assets/locations/${W}/pieces/engine/p-1/mesh.glb`, yawOffsetDeg: 90, unitScale: 5 } },
] }
/** the top view as the page shows it, with its box 10 px per metre */
function topView(save = vi.fn(async () => {}), onPoint = vi.fn()) {
  render(<BlockingTopView plan={plan} path={[[0, 4], [0, -10]]} extras={[]} actions={[]} point={null} hits={[]} drawingExtra={null} onPoint={onPoint} />)
  const svg = screen.getByTestId('blocking-top-view') as unknown as SVGSVGElement
  const box = viewBox(plan, [[[0, 4], [0, -10]]])
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: (box[2] - box[0]) * 10, height: (box[3] - box[1]) * 10 } as DOMRect)
  const px = (x: number, z: number) => ({ clientX: (x - box[0]) * 10, clientY: (z - box[1]) * 10, pointerId: 1 })
  return { svg, px, save, onPoint }
}

describe('dragging set pieces in the top view', () => {
  it('the top view mounts the layer: one handle per kit piece, a generated piece also shows its footprint', () => {
    topView()
    expect(screen.getByTestId('piece-drag-layer')).toBeTruthy()
    expect(screen.getByTestId('piece-drag-0')).toBeTruthy()
    expect(screen.getByTestId('piece-handle-1').querySelectorAll('circle').length).toBe(2) // footprint + handle
  })

  it('a drag moves the piece and saves once; a press on a piece never adds a path point', async () => {
    const save = vi.fn(async () => {})
    const onPoint = vi.fn()
    render(<svg data-testid="host" viewBox="-20 -30 40 40" onClick={() => onPoint()}><PieceDragLayer plan={plan} world={W} save={save} /></svg>)
    const svg = screen.getByTestId('host')
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 400, height: 400 } as DOMRect)
    const h = screen.getByTestId('piece-drag-1')
    const at = (x: number, z: number) => ({ clientX: (x + 20) * 10, clientY: (z + 30) * 10, pointerId: 1 })
    fireEvent.pointerDown(h, at(-9, -14))
    fireEvent.pointerMove(h, at(-12, -20))
    expect(h.getAttribute('cx')).toBe('-12') // drawn where it is being dragged
    await act(async () => { fireEvent.pointerUp(h, at(-12, -20)); fireEvent.click(h, at(-12, -20)) })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(W, 1, 'steam locomotive', [-12, -20], 0)
    expect(onPoint).not.toHaveBeenCalled()
    expect(screen.getByTestId('piece-drag-1').getAttribute('cx')).toBe('-12') // held there until the re-read plan shows it
  })

  it('a press without a move saves nothing; [ and ] turn the picked piece 15° (Shift: 5°)', async () => {
    const save = vi.fn(async () => {})
    render(<svg viewBox="-20 -30 40 40"><PieceDragLayer plan={plan} world={W} save={save} /></svg>)
    const h = screen.getByTestId('piece-drag-0')
    fireEvent.pointerDown(h, { clientX: 1, clientY: 1, pointerId: 1 }); fireEvent.pointerUp(h, { clientX: 1, clientY: 1, pointerId: 1 })
    expect(save).not.toHaveBeenCalled()
    await act(async () => { fireEvent.keyDown(h, { key: ']' }) })
    expect(save).toHaveBeenLastCalledWith(W, 0, 'barrels', [6, -8], 15)
    await act(async () => { fireEvent.keyDown(h, { key: '[', shiftKey: true }) })
    expect(save).toHaveBeenLastCalledWith(W, 0, 'barrels', [6, -8], 10)
    expect(screen.getByTestId('piece-turn-0')).toBeTruthy() // the picked piece shows its turn knob
  })

  it('a refused move snaps back and says why beside the piece', async () => {
    const save = vi.fn(async () => { throw new Error('the set would not be valid after this change') })
    render(<svg data-testid="host" viewBox="-20 -30 40 40"><PieceDragLayer plan={plan} world={W} save={save} /></svg>)
    vi.spyOn(screen.getByTestId('host'), 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 400, height: 400 } as DOMRect)
    const h = screen.getByTestId('piece-drag-0')
    fireEvent.pointerDown(h, { clientX: 260, clientY: 220, pointerId: 1 })
    fireEvent.pointerMove(h, { clientX: 200, clientY: 200, pointerId: 1 })
    await act(async () => { fireEvent.pointerUp(h, { clientX: 200, clientY: 200, pointerId: 1 }) })
    expect(screen.getByTestId('piece-drag-error').textContent).toMatch(/barrels was not moved: the set would not be valid/)
    expect(screen.getByTestId('piece-drag-0').getAttribute('cx')).toBe('6')
  })

  it('the turn knob faces the piece toward the pointer (0 = +z)', () => {
    expect(yawToward([0, 0], [0, 5])).toBe(0)
    expect(yawToward([0, 0], [5, 0])).toBe(90)
    expect(yawToward([0, 0], [0, -5])).toBe(180)
  })

  it('in the page\'s own top view a click on a piece adds no path point, a click on the ground still does', () => {
    const { svg, px, onPoint } = topView()
    fireEvent.click(screen.getByTestId('piece-drag-0'), px(6, -8))
    expect(onPoint).not.toHaveBeenCalled()
    fireEvent.click(svg, px(-2, 0))
    expect(onPoint).toHaveBeenCalledTimes(1)
  })
})

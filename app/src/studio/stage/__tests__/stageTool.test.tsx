// @vitest-environment jsdom
// The move gizmo (step 12): a picked piece wears three world-axis arrows in the Free and Top panes (their own camera layer, so the
// Camera pane and the captures never see them). Dragging the X arrow moves the piece along X only and saves once on release; the
// press is the tool's (no pick drag, no orbit). The tool's maths: an axis move keeps the other axis, a free move follows the
// ground under the pointer, a turn follows the pointer across, a size grows to the right. The keys (step 13): G / R / S start a tool
// with the pointer over the Free view, X / Y / Z hold a move to one axis, Enter keeps it; a key typed into a field never starts one,
// and the tool's keys never reach the camera's own (R is not Record, S is not back).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Ray, Vector3 } from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import { GIZMO_LAYER, gizmoSizeFor } from '../../../labs/projection/stage3d/moveGizmo'
import { SCALE_PX, toolResult, TURN_PER_PX, type ToolStart } from '../stageToolMath'
import { api, CRATES, disposeRig, Host, letGo, moveTo, press, Probe, stageLab, type Pt } from './stagePickRig'
import { CH, CW } from './liveFakes'
import type { Panes } from '../../../labs/projection/engine/panes'

afterEach(() => { cleanup(); disposeRig() })

describe('the tool maths', () => {
  const start: ToolStart = { at: [3, -9], yaw: 10, mouse: { x: 100, y: 100 }, ground: [3, -9], origin: new Vector3(3, 0, -9), s0: 0 }
  const down = new Ray(new Vector3(4, 10, -9), new Vector3(0, -1, 0))
  it('an X move keeps Z; a Z move keeps X; a Y move is a height change only', () => {
    expect(toolResult('move', 'x', start, { x: 0, y: 0 }, down, null).at).toEqual([4, -9])
    expect(toolResult('move', 'z', { ...start, origin: new Vector3(3, 0, -9) }, { x: 0, y: 0 }, new Ray(new Vector3(3, 10, -7.5), new Vector3(0, -1, 0)), null).at).toEqual([3, -7.5])
    const up = toolResult('move', 'y', start, { x: 0, y: 0 }, new Ray(new Vector3(-5, 0.4, -9), new Vector3(1, 0, 0)), null)
    expect(up.lift).toBeCloseTo(0.4, 6)
    expect(up.at).toEqual([3, -9])
  })
  it('a free move follows the ground under the pointer; a turn follows the pointer across; a size doubles per SCALE_PX right, halves left', () => {
    expect(toolResult('move', null, start, { x: 0, y: 0 }, down, [5, -6]).at).toEqual([5, -6])
    expect(toolResult('rotate', null, start, { x: 140, y: 100 }, down, null).yaw).toBe(10 + Math.round(40 * TURN_PER_PX))
    expect(toolResult('scale', null, start, { x: 300, y: 100 }, down, null).scale).toBeCloseTo(2, 6)
    expect(toolResult('scale', null, start, { x: 100 + 4 * SCALE_PX, y: 100 }, down, null).scale).toBeCloseTo(16, 6) // a 2 m piece to 32 m
    expect(toolResult('scale', null, start, { x: 100 - SCALE_PX, y: 100 }, down, null).scale).toBeCloseTo(0.5, 6)
  })
})

/** where a world point shows in the Free pane (the Free pane alone fills the canvas) */
function freePt(panes: Panes, p: Vector3): Pt {
  const rect = panes.rect('free', CW, CH)!
  panes.free.updateMatrixWorld()
  const c = p.clone().project(panes.free)
  return { clientX: rect.x + ((c.x + 1) / 2) * rect.w, clientY: rect.y + ((1 - c.y) / 2) * rect.h }
}

describe('the move gizmo in the Free view', () => {
  it('only the Free and Top cameras see its layer; dragging the X arrow moves the piece along X only and saves once', () => {
    const { lab, canvas, panes, layer } = stageLab()
    panes.set(['free'])
    const a = api()
    render(<Host lab={lab} api={a} />)
    expect(panes.free.layers.isEnabled(GIZMO_LAYER)).toBe(true)
    expect(lab.stage!.view.layers.isEnabled(GIZMO_LAYER)).toBe(false) // the Camera pane and the captures never see it
    // pick the crates in the Free pane, then grab the X arrow near its tip
    const at = freePt(panes, CRATES.clone().add(new Vector3(0, 0.4, 0)))
    press(canvas, at); letGo(canvas, at)
    const g = layer.group.getObjectByName('stage-gizmo')!
    expect(g.visible).toBe(true)
    const tip = g.position.clone().add(new Vector3(gizmoSizeFor(panes.free, g.position) * 0.85, 0, 0)) // as the Free pane sizes it
    const from = freePt(panes, tip), to = freePt(panes, tip.clone().add(new Vector3(1.5, 0, 0)))
    press(canvas, from)
    moveTo(canvas, to)
    letGo(canvas, to)
    expect(a.move).toHaveBeenCalledTimes(1)
    const [, index, , where] = (a.move as unknown as { mock: { calls: [string, number, string, [number, number], number][] } }).mock.calls[0]
    expect(index).toBe(0)
    expect(where[0]).toBeCloseTo(CRATES.x + 1.5, 1)
    expect(where[1]).toBeCloseTo(CRATES.z, 6) // Z untouched
  })
})

describe('the keys: G / R / S, X / Y / Z, Enter and Esc', () => {
  const toolOf = () => JSON.parse(screen.getByTestId('probe-tool').textContent || 'null') as { kind: string; axis: string | null } | null
  const key = (code: string, key: string, target: Window | HTMLElement = window) => act(() => { fireEvent.keyDown(target, { code, key }) })
  function picked() {
    const r = stageLab()
    r.panes.set(['free'])
    const a = api()
    render(<Probe lab={r.lab} api={a} />)
    const at = freePt(r.panes, CRATES.clone().add(new Vector3(0, 0.4, 0)))
    press(r.canvas, at); letGo(r.canvas, at)
    moveTo(r.canvas, at) // the pointer rests over the Free view
    return { ...r, a, at }
  }

  it('G starts a move, X holds it to X, the pointer moves it along X only, Enter keeps it with one save', () => {
    const { canvas, panes, a, at } = picked()
    key('KeyG', 'g')
    expect(toolOf()).toEqual({ kind: 'move', axis: null, via: 'key' })
    key('KeyX', 'x')
    expect(toolOf()?.axis).toBe('x')
    moveTo(canvas, freePt(panes, CRATES.clone().add(new Vector3(1.2, 0.4, 0.8))))
    expect(a.move).not.toHaveBeenCalled() // live until kept
    key('Enter', 'Enter')
    expect(toolOf()).toBeNull()
    expect(a.move).toHaveBeenCalledTimes(1)
    const where = (a.move as unknown as { mock: { calls: [string, number, string, [number, number], number][] } }).mock.calls[0][3]
    expect(where[1]).toBeCloseTo(CRATES.z, 6) // Z untouched
    expect(where[0]).not.toBeCloseTo(CRATES.x, 1)
    void at
  })

  it('R turns and S sizes; Esc cancels with nothing saved; the camera never sees the tool keys', () => {
    const { canvas, a, at } = picked()
    const engineKeys: string[] = []
    const spy = (e: KeyboardEvent) => engineKeys.push(e.code)
    window.addEventListener('keydown', spy) // where the operator's own keys listen (bubble, on the window)
    key('KeyR', 'r')
    expect(toolOf()?.kind).toBe('rotate')
    moveTo(canvas, { clientX: at.clientX + 40, clientY: at.clientY })
    key('Escape', 'Escape')
    expect(toolOf()).toBeNull()
    key('KeyS', 's')
    expect(toolOf()?.kind).toBe('scale')
    key('Escape', 'Escape')
    window.removeEventListener('keydown', spy)
    expect(engineKeys).toEqual([])
    expect(a.move).not.toHaveBeenCalled()
    expect(a.edit).not.toHaveBeenCalled()
  })

  it('a key typed into a text box never starts a tool', () => {
    picked()
    const box = document.createElement('input')
    document.body.appendChild(box)
    key('KeyG', 'g', box)
    expect(toolOf()).toBeNull()
    box.remove()
  })
})

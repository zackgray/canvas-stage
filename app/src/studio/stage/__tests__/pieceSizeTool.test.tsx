// @vitest-environment jsdom
// The size tool (S) on a set piece (owner 2026-10-29, the grandstand): it grows past the old 4x cap, the size drawn while sizing is
// the size saved (held to the piece's 100 m range, so letting go never snaps it), and a second size before the first save's
// re-read lands builds on what is drawn, not on the plan read before it (the "snapped back to its original size" report).
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { Vector3 } from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import { scaleRangeOf } from '../../scene/pieceScale'
import { SCALE_PX } from '../stageToolMath'
import { CH, CW, plan } from './liveFakes'
import { api, CRATES, disposeRig, letGo, moveTo, piece, press, Probe, stageLab, type Pt } from './stagePickRig'
import type { Panes } from '../../../labs/projection/engine/panes'

afterEach(() => { cleanup(); disposeRig() })

function freePt(panes: Panes, p: Vector3): Pt {
  const rect = panes.rect('free', CW, CH)!
  panes.free.updateMatrixWorld()
  const c = p.clone().project(panes.free)
  return { clientX: rect.x + ((c.x + 1) / 2) * rect.w, clientY: rect.y + ((1 - c.y) / 2) * rect.h }
}
const key = (code: string, k: string) => act(() => { fireEvent.keyDown(window, { code, key: k }) })

function picked() {
  const r = stageLab()
  r.panes.set(['free'])
  const a = api()
  render(<Probe lab={r.lab} api={a} />)
  const at = freePt(r.panes, CRATES.clone().add(new Vector3(0, 0.4, 0)))
  press(r.canvas, at); letGo(r.canvas, at)
  moveTo(r.canvas, at)
  return { ...r, a, at }
}
const edits = (a: ReturnType<typeof api>) => (a.edit as unknown as { mock: { calls: [string, number, string, { scale?: number }][] } }).mock.calls.map((c) => c[3].scale)
/** S, the pointer `px` across, Enter */
function size(r: ReturnType<typeof picked>, px: number) {
  key('KeyS', 's')
  moveTo(r.canvas, { clientX: r.at.clientX + px, clientY: r.at.clientY })
  const drawn = piece(r.layer, 0).scale.x
  key('Enter', 'Enter')
  moveTo(r.canvas, r.at)
  return drawn
}

describe('the size tool on a set piece', () => {
  it('grows well past the old 4x: three doublings save 8x, drawn at 8x', () => {
    const r = picked()
    expect(size(r, 3 * SCALE_PX)).toBeCloseTo(8, 6)
    expect(edits(r.a)).toEqual([8])
  })

  it('is held to the piece\'s range while sizing and on release, so letting go never snaps it', () => {
    const r = picked()
    const top = scaleRangeOf(plan.kit[0])[1]
    expect(top).toBeGreaterThan(4)
    expect(size(r, 30 * SCALE_PX)).toBeCloseTo(top, 6) // drawn at the top, not 2^30
    expect(edits(r.a)).toEqual([top])
  })

  it('a second size before the re-read lands builds on the drawn size, not the stale plan', () => {
    const r = picked()
    size(r, 3 * SCALE_PX) // saved 8x; the fake route never re-reads, so the plan still says 1x
    size(r, -SCALE_PX) // half of what is drawn
    expect(edits(r.a)).toEqual([8, 4])
  })
})

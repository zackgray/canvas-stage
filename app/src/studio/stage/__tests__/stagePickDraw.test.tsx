// @vitest-environment jsdom
// F2 (QA run 5): drawing the subject's path accepts ground clicks in the Free view and the Top View. Through the real pick
// pipeline (useStagePick on a real kit layer and real panes) with Blocking's real ground click (useGroundClick) mounted the way
// the subject's panel mounts it: only while the subject is picked. The old pipeline let go of the pick on an empty-ground click
// while drawing, which unmounted the draw before its click landed; the next click then opened "Add here".
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { Vector3, type PerspectiveCamera } from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import type { Panes } from '../../../labs/projection/engine/panes'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import type { Stage } from '../../../labs/projection/engine/Stage'
import { useStagePick } from '../useStagePick'
import { setGroundDrawing } from '../groundDrawing'
import { useGroundClick } from '../panels/blocking/groundClick'
import type { Pt as GroundPt } from '../panels/blocking/blockingMath'
import { CH, CW } from './liveFakes'
import { api, clickAt, disposeRig, letGo, moveTo, press, stageLab, type Pt } from './stagePickRig'

afterEach(() => { cleanup(); disposeRig(); setGroundDrawing(false) })

/** the subject's panel stand-in: while mounted it is drawing (the flag Blocking's view sets) and takes the ground's clicks */
function Drawing({ stage, onPoint }: { stage: Stage; onPoint: (p: GroundPt) => void }) {
  useEffect(() => { setGroundDrawing(true); return () => setGroundDrawing(false) }, [])
  useGroundClick(stage, onPoint)
  return <div data-testid="drawing" />
}

function Shell({ lab, points }: { lab: ProjectionLabState; points: GroundPt[] }) {
  const s = useStagePick(lab, api())
  return (
    <div>
      <div data-testid="pick">{JSON.stringify(s.pick)}</div>
      <div data-testid="menu">{JSON.stringify(s.menu)}</div>
      <button type="button" data-testid="pick-subject" onClick={() => s.select({ t: 'mark' })}>subject</button>
      {s.pick?.t === 'mark' && <Drawing stage={lab.stage!} onPoint={(p) => points.push(p)} />}
    </div>
  )
}

/** a canvas point over a pane that shows the given ground spot */
function paneGround(panes: Panes, pane: 'free' | 'top', x: number, z: number, groundAt: (x: number, z: number) => number): Pt {
  const rect = panes.rect(pane, CW, CH)!
  const cam = (pane === 'free' ? panes.free : panes.top) as PerspectiveCamera
  cam.updateMatrixWorld()
  const c = new Vector3(x, groundAt(x, z), z).project(cam)
  return { clientX: rect.x + ((c.x + 1) / 2) * rect.w, clientY: rect.y + ((1 - c.y) / 2) * rect.h }
}

function rig(panesShown: ('camera' | 'free' | 'top')[]) {
  const r = stageLab()
  Object.assign(r.lab.stage as object, { kit: r.layer }) // useGroundClick reads the stage's kit ground
  r.panes.set(panesShown)
  const points: GroundPt[] = []
  render(<Shell lab={r.lab} points={points} />)
  fireEvent.click(screen.getByTestId('pick-subject'))
  expect(screen.getByTestId('drawing')).toBeTruthy()
  return { ...r, points }
}
const pick = () => JSON.parse(screen.getByTestId('pick').textContent || 'null') as { t: string } | null
const menu = () => JSON.parse(screen.getByTestId('menu').textContent || 'null') as { kind: string | null } | null

describe('drawing the path takes ground clicks in every pane', () => {
  for (const pane of ['free', 'top'] as const) {
    it(`${pane === 'free' ? 'Free view' : 'Top View'}: each click adds a point; no mark, no menu, and the draw stays on`, () => {
      const { canvas, panes, layer, points } = rig(['camera', pane])
      const spots: [number, number][] = [[1, -6], [2, -8], [0.5, -10]]
      for (const [x, z] of spots) clickAt(canvas, paneGround(panes, pane, x, z, layer.groundAt))
      expect(points).toHaveLength(3)
      points.forEach((p, i) => { expect(p[0]).toBeCloseTo(spots[i][0], 1); expect(p[1]).toBeCloseTo(spots[i][1], 1) })
      expect(pick()).toEqual({ t: 'mark' }) // the subject stays picked: no "Add here", no let-go
      expect(screen.getByTestId('drawing')).toBeTruthy()
    })
  }

  it('F3: with no draw on, a right-click on empty ground marks a spot in the Free view but never in the Camera pane', () => {
    const r = stageLab()
    r.panes.set(['camera', 'free'])
    render(<Shell lab={r.lab} points={[]} />)
    const cam = r.panes.rect('camera', CW, CH)!
    // the Camera half's middle, a little low: its ray comes down on the set's ground
    const inCam = { clientX: cam.x + cam.w / 2, clientY: cam.y + cam.h * 0.75 }
    expect(r.panes.at(inCam.clientX, inCam.clientY)).toBe('camera')
    expect(r.panes.rayAt(inCam.clientX, inCam.clientY).ray.direction.y).toBeLessThan(0)
    clickAt(r.canvas, inCam)
    expect(pick()).toBeNull()
    fireEvent.contextMenu(r.canvas, { ...inCam, button: 2 })
    expect(pick()).toBeNull()
    const inFree = paneGround(r.panes, 'free', 1, -6, r.layer.groundAt)
    expect(r.panes.at(inFree.clientX, inFree.clientY)).toBe('free')
    clickAt(r.canvas, inFree)
    expect(menu()).toBeNull() // a left-click never opens the menu
    fireEvent.contextMenu(r.canvas, { ...inFree, button: 2 })
    expect(menu()?.kind).toBeNull()
  })

  it('a drag while drawing still orbits and adds nothing', () => {
    const { canvas, panes, layer, points } = rig(['camera', 'free'])
    const at = paneGround(panes, 'free', 1, -6, layer.groundAt)
    press(canvas, at)
    moveTo(canvas, { clientX: at.clientX + 40, clientY: at.clientY + 10 })
    letGo(canvas, { clientX: at.clientX + 40, clientY: at.clientY + 10 })
    fireEvent.click(canvas, { clientX: at.clientX + 40, clientY: at.clientY + 10 })
    expect(points).toHaveLength(0)
    expect(pick()).toEqual({ t: 'mark' })
  })
})

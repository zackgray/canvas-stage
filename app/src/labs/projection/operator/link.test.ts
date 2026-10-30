import { PerspectiveCamera, Vector3 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { describe, expect, it } from 'vitest'
import { emptyInput } from '../../controller/input/types'
import { threeFovDeg } from '../../controller/math/lens'
import { resumeOrbit } from '../engine/viewMoves'
import { toDeg, vfovFromFocal } from '../math/camera'
import { focalOfView, inputMoves, operatorDriver, takeOverView } from './link'
import { ASPECT, FRAME, scriptedEngine, stageView } from './testRig'

const pose = (v: PerspectiveCamera) => ({ position: v.position.clone(), quaternion: v.quaternion.clone(), fov: v.fov })
function expectSame(v: PerspectiveCamera, p: ReturnType<typeof pose>, eps = 1e-9) {
  expect(v.position.distanceTo(p.position)).toBeLessThan(eps)
  expect(v.quaternion.angleTo(p.quaternion)).toBeLessThan(eps)
  expect(Math.abs(v.fov - p.fov)).toBeLessThan(eps)
}

describe('lens hand-off', () => {
  it('focalOfView inverts threeFovDeg, and both labs agree on the fov', () => {
    for (const aspect of [16 / 9, 4 / 3, 1, 9 / 16]) {
      for (const f of [12, 24, 35, 50, 85]) {
        expect(threeFovDeg(f, aspect)).toBeCloseTo(toDeg(vfovFromFocal(f, aspect)), 10)
        const v = new PerspectiveCamera(threeFovDeg(f, aspect), aspect)
        expect(focalOfView(v)).toBeCloseTo(f, 9)
      }
    }
  })

  it('takes a 15 mm view as it is (inside 12-85 mm), and clamps a lens wider than 12 mm silently (no note)', () => {
    const { engine } = scriptedEngine()
    const view = stageView()
    view.fov = threeFovDeg(15, ASPECT)
    expect(takeOverView(engine, view)).toBeNull()
    expect(engine.out.focal).toBeCloseTo(15, 9)
    view.fov = threeFovDeg(10, ASPECT)
    expect(takeOverView(engine, view)).toBeNull()
    expect(engine.out.focal).toBe(12)
    expect(view.fov).toBeCloseTo(threeFovDeg(12, ASPECT), 10)
  })
})

describe('Orbit -> Operator -> Orbit', () => {
  it('Operator starts exactly at the view and holds it with no input', () => {
    const { engine } = scriptedEngine()
    const view = stageView()
    const before = pose(view)
    expect(takeOverView(engine, view)).toBeNull()
    const drive = operatorDriver(engine, view, () => {})
    for (let i = 0; i < 120; i++) {
      drive(FRAME)
      expectSame(view, before)
    }
  })

  it('a camera moved by something else (snap, orbit buttons) is taken over where it is', () => {
    const { engine } = scriptedEngine()
    const view = stageView()
    takeOverView(engine, view)
    const drive = operatorDriver(engine, view, () => {})
    drive(FRAME)
    view.position.set(0, 1.6, 0)
    view.lookAt(0, 1, -8)
    const snapped = pose(view)
    for (let i = 0; i < 30; i++) drive(FRAME)
    expectSame(view, snapped)
  })

  it('Orbit resumes from where the operator left the camera, with no leftover orbit momentum', () => {
    const view = stageView()
    const controls = new OrbitControls(view)
    controls.enableDamping = true
    controls.target.set(-0.5, 1.1, -6)
    controls.update()
    controls.rotateLeft(0.4) // a flick, then the user switches mode mid-damping
    for (let i = 0; i < 3; i++) controls.update()

    const { engine, input } = scriptedEngine()
    takeOverView(engine, view)
    const drive = operatorDriver(engine, view, () => {})
    input.move = { x: 0.3, y: 1 }
    input.look = { x: 0.5, y: 0.2 }
    for (let i = 0; i < 60; i++) drive(FRAME)
    Object.assign(input, emptyInput())
    for (let i = 0; i < 240; i++) drive(FRAME) // let the stabiliser settle
    const left = pose(view)

    // the target lands on a surface 3 m straight ahead, as Pivot.centre() would
    resumeOrbit(view, controls, () => {
      controls.target.copy(view.position).addScaledVector(view.getWorldDirection(new Vector3()), 3)
      controls.update()
      return true
    })
    for (let i = 0; i < 120; i++) {
      controls.update()
      expectSame(view, left, 1e-6)
    }
    expect(controls.target.distanceTo(view.position)).toBeCloseTo(3, 6)
  })
})

describe('inputMoves', () => {
  it('counts camera and lens input, not the timeline', () => {
    expect(inputMoves(emptyInput())).toBe(false)
    expect(inputMoves({ ...emptyInput(), scrub: 0.1 })).toBe(false)
    for (const patch of [{ move: { x: 0, y: 0.2 } }, { look: { x: 0.01, y: 0 } }, { lift: -1 }, { mouse: { x: 1, y: 0 } },
      { wheel: 3 }, { zoomIn: 0.5 }, { zoomOut: 0.05 }]) {
      expect(inputMoves({ ...emptyInput(), ...patch })).toBe(true)
    }
  })
})

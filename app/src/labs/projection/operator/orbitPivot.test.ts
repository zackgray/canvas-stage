// The operator's Orbit pivot on the stage: Manual (default; the placed pivot, else the frame-centre surface) or the
// performance's actors; entering Orbit keeps the camera where it is (radius / angle / aim from the current pose), the
// mouse gesture orbits and dollies around the pivot, and a take keeps the pivot it started with.
import { Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { emptyInput, type InputState } from '../../controller/input/types'
import type { OrbitRig } from '../../controller/rigs/orbitRig'
import { World } from '../world/World'
import { dragOrbit, wheelDolly } from './orbitDrag'
import { OrbitPivot, type PivotHost } from './orbitPivot'
import { STAGE_RIGS } from './link'
import { StageOperatorEngine } from './stageEngine'
import { ASPECT, FRAME, stageView } from './testRig'

const BACK_WALL = new Vector3(-1, 1.2, -20)

/** A stage stand-in: frame-centre hit, placed pivot, performance centre and an armed pick it can fire. */
function fakeHost(over: { performance?: Vector3 | null } = {}) {
  const s = {
    manual: null as Vector3 | null,
    centre: BACK_WALL.clone() as Vector3 | null,
    performance: over.performance ?? null,
    marker: null as Vector3 | null,
    pickDone: null as ((p: Vector3 | null) => void) | null,
  }
  const host: PivotHost = {
    manual: () => s.manual,
    setManual: (p) => { s.manual = p?.clone() ?? null; if (p) s.marker = p.clone() },
    centreHit: () => s.centre?.clone() ?? null,
    aim: () => { if (s.centre) s.marker = s.centre.clone(); return (s.centre ?? new Vector3()).clone() },
    performance: () => s.performance?.clone() ?? null,
    show: (p) => { s.marker = p.clone() },
    pick: (done) => { s.pickDone = done; return () => { s.pickDone = null; done(null) } },
  }
  /** the user clicks the view at a surface point while a pick is armed */
  const click = (p: Vector3) => { const d = s.pickDone!; s.pickDone = null; host.setManual(p); d(p) }
  return { s, host, click }
}

describe('pivot selection', () => {
  it('Manual is the default; with nothing placed it is the frame-centre surface (the old behaviour)', () => {
    const pv = new OrbitPivot()
    const { s, host } = fakeHost()
    pv.host = host
    expect(pv.mode).toBe('manual')
    expect(pv.target()!.equals(BACK_WALL)).toBe(true)
    s.manual = new Vector3(0.5, 1, -4)
    expect(pv.target()!.equals(s.manual)).toBe(true)
    expect(s.marker!.equals(s.manual)).toBe(true)
  })

  it('Set pivot arms a click; the click places the pivot, switches to Manual and re-anchors', () => {
    const pv = new OrbitPivot()
    const { s, host, click } = fakeHost({ performance: new Vector3(0, 1, -5) })
    pv.host = host
    let changes = 0
    pv.onChange = () => changes++
    pv.setMode('performance')
    pv.pick()
    expect(pv.picking).toBe(true)
    click(new Vector3(2, 0.9, -6))
    expect(pv.picking).toBe(false)
    expect(pv.mode).toBe('manual')
    expect(pv.target()!.equals(new Vector3(2, 0.9, -6))).toBe(true)
    expect(changes).toBe(2)
    pv.pick()
    pv.pick() // again while armed: cancel
    expect(pv.picking).toBe(false)
    expect(s.manual!.equals(new Vector3(2, 0.9, -6))).toBe(true)
  })

  it('a mouse-down place() puts the pivot there and switches to Manual', () => {
    const pv = new OrbitPivot()
    const { s, host } = fakeHost({ performance: new Vector3(0, 1, -5) })
    pv.host = host
    pv.setMode('performance')
    expect(pv.place(new Vector3(1, 1, -2))).toBe(true)
    expect(pv.mode).toBe('manual')
    expect(s.manual!.equals(new Vector3(1, 1, -2))).toBe(true)
  })

  it('C / R3 in Manual places the pivot on what is at the frame centre now; a miss keeps the old one', () => {
    const pv = new OrbitPivot()
    const { s, host } = fakeHost()
    pv.host = host
    s.centre = new Vector3(1, 1, -3)
    expect(pv.recentre()!.equals(new Vector3(1, 1, -3))).toBe(true)
    expect(s.manual!.equals(new Vector3(1, 1, -3))).toBe(true)
    s.centre = null
    expect(pv.recentre()!.equals(new Vector3(1, 1, -3))).toBe(true)
  })

  it("Performance needs a performance: refused without one, the actors' centre with one, Manual's rules when it goes", () => {
    const pv = new OrbitPivot()
    const { s, host } = fakeHost()
    pv.host = host
    expect(pv.available('performance')).toBe(false)
    pv.setMode('performance')
    expect(pv.mode).toBe('manual')
    s.performance = new Vector3(0.3, 1.1, -5)
    pv.setMode('performance')
    expect(pv.mode).toBe('performance')
    expect(pv.target()!.equals(s.performance)).toBe(true)
    s.performance = null
    expect(pv.target()!.equals(BACK_WALL)).toBe(true)
  })

  it('no change while a take records', () => {
    const pv = new OrbitPivot()
    const { s, host } = fakeHost({ performance: new Vector3(0, 1, -5) })
    pv.host = host
    pv.canChange = () => false
    pv.setMode('performance')
    pv.pick()
    expect(pv.place(new Vector3(3, 1, -3))).toBe(false)
    s.manual = new Vector3(1, 1, -1)
    pv.clear()
    expect(pv.mode).toBe('manual')
    expect(pv.picking).toBe(false)
    expect(s.manual.equals(new Vector3(1, 1, -1))).toBe(true)
  })
})

function engineWith(host: PivotHost) {
  const engine = new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false })
  const input: InputState = emptyInput()
  engine.hub.poll = () => {
    engine.hub.state = { ...input, actions: new Set(input.actions) }
    input.actions.clear()
    return engine.hub.state
  }
  engine.bind(new World(async () => ({ missing: 'test' })), () => ASPECT)
  engine.pivot.host = host
  engine.stabiliser.enabled = false
  const view = stageView()
  engine.takeOver(view.position, view.quaternion, 35)
  return { engine, input, view }
}
const horiz = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.z - b.z)
const orbitRig = (e: StageOperatorEngine) => e.rigs.orbit as OrbitRig

describe('the Orbit rig on the stage pivot', () => {
  it('entering Orbit keeps the camera exactly where it is (position and aim); radius / angle come from it', () => {
    const pivot = new Vector3(-0.2, 1.1, -5)
    const { s, host } = fakeHost()
    s.manual = pivot
    const { engine, view } = engineWith(host)
    engine.setRig('orbit')
    engine.tick(FRAME, ASPECT)
    expect(orbitRig(engine).target.equals(pivot)).toBe(true)
    expect(engine.out.position.distanceTo(view.position)).toBeLessThan(1e-9)
    expect(engine.out.quaternion.angleTo(view.quaternion)).toBeLessThan(1e-6)
  })

  it("orbiting with the stick circles the pivot at the camera's starting radius and height", () => {
    const pivot = new Vector3(-0.2, 1.1, -5)
    const { s, host } = fakeHost()
    s.manual = pivot
    const { engine, input, view } = engineWith(host)
    engine.setRig('orbit')
    engine.tick(FRAME, ASPECT)
    const r = horiz(view.position, pivot)
    input.move = { x: 1, y: 0 }
    for (let i = 0; i < 120; i++) engine.tick(FRAME, ASPECT)
    expect(engine.out.position.distanceTo(view.position)).toBeGreaterThan(0.5)
    expect(horiz(engine.out.position, pivot)).toBeCloseTo(r, 6)
    expect(engine.out.position.y).toBeCloseTo(view.position.y, 9)
  })

  it('mouse drag orbits around the pivot at a constant distance (up / down too); the wheel dollies toward it', () => {
    const pivot = new Vector3(-0.2, 1.1, -5)
    const { s, host } = fakeHost()
    s.manual = pivot
    const { engine } = engineWith(host)
    engine.setRig('orbit')
    engine.tick(FRAME, ASPECT)
    const d0 = engine.out.position.distanceTo(pivot)
    const y0 = engine.out.position.y
    dragOrbit(orbitRig(engine), 80, 60) // right and down: around, and up over the pivot
    engine.tick(FRAME, ASPECT)
    expect(engine.out.position.distanceTo(pivot)).toBeCloseTo(d0, 6)
    expect(engine.out.position.y).toBeGreaterThan(y0)
    wheelDolly(orbitRig(engine), -300)
    engine.tick(FRAME, ASPECT)
    expect(engine.out.position.distanceTo(pivot)).toBeCloseTo(d0 * Math.exp(-0.3), 6)
  })

  it('R3 / C (pad or keys) puts the pivot on what is under the reticle and the orbit circles it', () => {
    const { s, host } = fakeHost()
    const { engine, input } = engineWith(host)
    engine.setRig('orbit')
    engine.tick(FRAME, ASPECT)
    const fighter = new Vector3(0.4, 1.2, -4.5)
    s.centre = fighter
    input.actions.add('recenter')
    engine.tick(FRAME, ASPECT)
    expect(s.manual!.equals(fighter)).toBe(true)
    expect(orbitRig(engine).target.equals(fighter)).toBe(true)
  })

  it('a pivot change re-anchors without moving the camera; a take keeps its start pivot', () => {
    const first = new Vector3(-0.2, 1.1, -5)
    const actors = new Vector3(0.6, 1.0, -4)
    const { s, host } = fakeHost({ performance: actors })
    s.manual = first
    const { engine, input } = engineWith(host)
    engine.pivot.setMode('manual') // chosen explicitly: no automatic Performance
    engine.setRig('orbit')
    engine.tick(FRAME, ASPECT)
    engine.toggleRecording()
    input.move = { x: 0.5, y: 0 }
    const r = horiz(engine.out.position, first)
    for (let i = 0; i < 30; i++) {
      engine.tick(FRAME, ASPECT)
      if (i === 5) engine.pivot.setMode('performance') // refused mid-take
      if (i === 10) input.actions.add('recenter') // C / R3: gyro only mid-take
      if (i === 15) engine.pivot.pick() // refused mid-take
      if (i === 20) engine.pivot.place(new Vector3(3, 1, -3)) // a mouse-down mid-take: refused
    }
    expect(engine.deck.recording).toBe(true)
    expect(orbitRig(engine).target.equals(first)).toBe(true)
    expect(engine.pivot.mode).toBe('manual')
    expect(engine.pivot.picking).toBe(false)
    engine.stopRecording()
    for (const smp of engine.deck.take!.raw.samples) expect(horiz(new Vector3(...smp.position), first)).toBeCloseTo(r, 2)
    input.move = { x: 0, y: 0 }
    engine.tick(FRAME, ASPECT)
    const at = engine.out.position.clone()
    // after the take: Performance re-anchors on the actors, the camera stays put and turns to frame them
    engine.pivot.setMode('performance')
    expect(orbitRig(engine).target.equals(actors)).toBe(true)
    engine.tick(FRAME, ASPECT)
    expect(engine.out.position.distanceTo(at)).toBeLessThan(1e-9)
    const fwd = new Vector3(0, 0, -1).applyQuaternion(engine.out.quaternion)
    expect(fwd.angleTo(actors.clone().sub(at))).toBeLessThan(1e-6)
    // a pivot placed in the view (mouse down) keeps the framing: no swing
    const q = new Quaternion().copy(engine.out.quaternion)
    engine.pivot.place(new Vector3(1.5, 0.9, -6))
    engine.tick(FRAME, ASPECT)
    expect(engine.out.position.distanceTo(at)).toBeLessThan(1e-9)
    expect(engine.out.quaternion.angleTo(q)).toBeLessThan(1e-6)
  })
})

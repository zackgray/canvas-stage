// The Orbit pivot's Performance default (once a performance with actors is loaded, unless the user chose Manual or
// placed a pivot since), the right-click that re-places the pivot, and the honest C / R3 flash.
import { DoubleSide, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Vector3 } from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyInput, type InputState } from '../../controller/input/types'
import type { OrbitRig } from '../../controller/rigs/orbitRig'
import { Pivot } from '../engine/pivot'
import { World } from '../world/World'
import { STAGE_RIGS } from './link'
import { stagePivotHost, type PivotHost } from './orbitPivot'
import { StageOperatorEngine } from './stageEngine'
import { ASPECT, FRAME, stageView } from './testRig'

afterEach(() => vi.unstubAllGlobals())

const WALL = new Vector3(-1, 1.2, -20)
const ACTORS = new Vector3(0.6, 1.0, -4)

function fakeHost() {
  const s = { manual: null as Vector3 | null, centre: WALL.clone() as Vector3 | null, performance: null as Vector3 | null,
    context: null as ((p: Vector3) => void) | null }
  const host: PivotHost = {
    manual: () => s.manual,
    setManual: (p) => { s.manual = p?.clone() ?? null },
    centreHit: () => s.centre?.clone() ?? null,
    aim: () => (s.centre ?? new Vector3()).clone(),
    performance: () => s.performance?.clone() ?? null,
    show: () => {},
    pick: () => () => {},
    contextPick: (fn) => { s.context = fn },
  }
  return { s, host }
}

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
  const recentre = () => { input.actions.add('recenter'); engine.tick(FRAME, ASPECT); return engine.message }
  return { engine, input, recentre }
}
const target = (e: StageOperatorEngine) => (e.rigs.orbit as OrbitRig).target

describe('Performance is the default once a performance is loaded', () => {
  it('loaded at the start: the first frame turns the mode to Performance and the orbit circles the actors', () => {
    const { s, host } = fakeHost()
    s.performance = ACTORS
    const { engine } = engineWith(host)
    engine.setRig('orbit')
    engine.tick(FRAME, ASPECT)
    engine.tick(FRAME, ASPECT)
    expect(engine.pivot.mode).toBe('performance')
    expect(target(engine).equals(ACTORS)).toBe(true)
  })

  it('without a performance it stays Manual; one that loads later (even after a pivot was placed) becomes the default', () => {
    const { s, host } = fakeHost()
    const { engine } = engineWith(host)
    engine.tick(FRAME, ASPECT)
    engine.pivot.place(new Vector3(1, 1, -3)) // placed with nothing else on offer
    engine.tick(FRAME, ASPECT)
    expect(engine.pivot.mode).toBe('manual')
    s.performance = ACTORS
    engine.tick(FRAME, ASPECT)
    expect(engine.pivot.mode).toBe('performance')
  })

  it('choosing Manual, or placing a pivot, while the performance is on offer sticks; a newly loaded one resets it', () => {
    const { s, host } = fakeHost()
    s.performance = ACTORS
    const { engine } = engineWith(host)
    engine.tick(FRAME, ASPECT)
    engine.pivot.setMode('manual')
    for (let i = 0; i < 5; i++) engine.tick(FRAME, ASPECT)
    expect(engine.pivot.mode).toBe('manual')
    s.performance = null // unloaded, then another loaded
    engine.tick(FRAME, ASPECT)
    s.performance = ACTORS
    engine.tick(FRAME, ASPECT)
    expect(engine.pivot.mode).toBe('performance')
  })

  it('a performance that loads mid-take waits: the pivot holds until the take ends', () => {
    const { s, host } = fakeHost()
    const { engine } = engineWith(host)
    engine.setRig('orbit')
    engine.tick(FRAME, ASPECT)
    engine.toggleRecording()
    s.performance = ACTORS
    for (let i = 0; i < 5; i++) engine.tick(FRAME, ASPECT)
    expect(engine.pivot.mode).toBe('manual')
    engine.stopRecording()
    engine.tick(FRAME, ASPECT)
    expect(engine.pivot.mode).toBe('performance')
  })
})

describe('right-click on the view re-places the pivot', () => {
  it('puts the manual pivot under the cursor and switches to Manual (Orbit rig, not mid-take, not on other rigs)', () => {
    const { s, host } = fakeHost()
    s.performance = ACTORS
    const { engine } = engineWith(host)
    engine.setRig('orbit')
    engine.tick(FRAME, ASPECT)
    engine.tick(FRAME, ASPECT)
    expect(engine.pivot.mode).toBe('performance')
    const spot = new Vector3(0.3, 1.4, -6)
    s.context!(spot)
    expect(engine.pivot.mode).toBe('manual')
    expect(s.manual!.equals(spot)).toBe(true)
    expect(target(engine).equals(spot)).toBe(true)
    engine.tick(FRAME, ASPECT)
    expect(engine.pivot.mode).toBe('manual') // a placed pivot is a choice: no automatic Performance again

    engine.toggleRecording()
    s.context!(new Vector3(5, 1, -5)) // mid-take: the pivot holds
    expect(s.manual!.equals(spot)).toBe(true)
    engine.stopRecording()
    engine.setRig('free')
    engine.tick(FRAME, ASPECT)
    s.context!(new Vector3(5, 1, -5)) // the Free rig: no pivot to place
    expect(s.manual!.equals(spot)).toBe(true)
  })

  it('the stage view: no context menu under the operator, the hit under the cursor; Orbit camera mode is untouched', () => {
    const handlers = new Map<string, (e: unknown) => void>()
    const dom = { style: {}, addEventListener: (t: string, fn: never) => handlers.set(t, fn), removeEventListener: () => {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }) } as unknown as HTMLElement
    vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} })
    vi.stubGlobal('document', { pointerLockElement: null })
    const cam = new PerspectiveCamera(50, 2, 0.1, 100)
    const wall = new Mesh(new PlaneGeometry(100, 100), new MeshBasicMaterial({ side: DoubleSide }))
    wall.position.set(0, 0, -10)
    const controls = { target: new Vector3(), update: () => {}, addEventListener: () => {}, removeEventListener: () => {} } as unknown as OrbitControls
    const pivot = new Pivot(cam, controls, dom, () => [wall])
    const placed: Vector3[] = []
    stagePivotHost({ pivot, aimPivot: () => new Vector3(), world: {} } as never).contextPick!((p) => placed.push(p))
    const menu = () => { const e = { clientX: 100, clientY: 50, prevented: false, preventDefault() { e.prevented = true } }; handlers.get('contextmenu')!(e); return e }

    pivot.enabled = true // Orbit camera mode: OrbitControls owns the right button (pan)
    expect(menu().prevented).toBe(false)
    expect(placed).toEqual([])
    pivot.enabled = false // the operator drives
    expect(menu().prevented).toBe(true)
    expect(placed.map((p) => p.toArray().map((v) => +v.toFixed(3)))).toEqual([[0, 0, -10]])
    vi.stubGlobal('document', { pointerLockElement: dom }) // locked mouse: no cursor to aim with
    expect(menu().prevented).toBe(true)
    expect(placed.length).toBe(1)
  })
})

describe('C / R3 says what it did', () => {
  it('Manual places the pivot on the reticle and says how far; a miss keeps it and says so', () => {
    const { s, host } = fakeHost()
    s.centre = new Vector3(0.4, 1.6, -17.5)
    const { engine, recentre } = engineWith(host)
    engine.setRig('orbit')
    engine.tick(FRAME, ASPECT)
    const msg = recentre()
    expect(msg).toBe(`Pivot placed · ${engine.out.position.distanceTo(s.centre).toFixed(1)} m`)
    expect(msg).toMatch(/^Pivot placed · 18\.0 m$/)
    s.centre = null
    expect(recentre()).toMatch(/^Nothing under the reticle: pivot kept · \d+\.\d m$/)
  })

  it('Performance: on the actors; another rig: the gyro only; mid-take: the pivot holds', () => {
    const { s, host } = fakeHost()
    s.performance = ACTORS
    const { engine, recentre } = engineWith(host)
    engine.tick(FRAME, ASPECT)
    expect(recentre()).toBe('Gyro recentred (pivot is for the Orbit rig)')
    engine.setRig('orbit')
    engine.tick(FRAME, ASPECT)
    expect(recentre()).toBe(`Pivot on the actors · ${engine.out.position.distanceTo(ACTORS).toFixed(1)} m`)
    engine.toggleRecording()
    expect(recentre()).toBe('Recentred (orbit pivot holds while recording)')
  })
})

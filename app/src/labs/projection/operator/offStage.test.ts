// S-01: Operator mode while the set is off the page (Develop, Render). The real chain, keys -> KeyboardMouse ->
// engine -> still trigger, on a fake window: off the page nothing is attached, and the trigger refuses anyway.
import type { PerspectiveCamera } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OperatorEngine } from '../../controller/engine/engine'
import { operatorDriver, operatorInput, STAGE_RIGS, takeOverView } from './link'
import { OFF_STAGE, offStage, STILL_KEY_ENABLED, STILL_KEY_OFF, stillTrigger } from './stillTrigger'
import { ASPECT, FRAME, stageView } from './testRig'

type Handler = (e: unknown) => void
/** window / canvas stand-in: listeners by type. */
function fakeTarget() {
  const on = new Map<string, Set<Handler>>()
  return {
    on,
    addEventListener: (t: string, fn: Handler) => { if (!on.has(t)) on.set(t, new Set()); on.get(t)!.add(fn) },
    removeEventListener: (t: string, fn: Handler) => { on.get(t)?.delete(fn) },
    count: () => [...on.values()].reduce((n, s) => n + s.size, 0),
  }
}

let win: ReturnType<typeof fakeTarget>
beforeEach(() => {
  win = fakeTarget()
  vi.stubGlobal('window', win)
  vi.stubGlobal('document', { pointerLockElement: null, exitPointerLock: () => {} })
})
afterEach(() => vi.unstubAllGlobals())

const body = { tagName: 'BODY', isContentEditable: false }
/** Dispatch a key on the window as the browser would, with focus on `target`; returns whether it was prevented. */
function key(type: 'keydown' | 'keyup', code: string, target: object = body): boolean {
  let prevented = false
  const e = { type, code, target, repeat: false, shiftKey: false, preventDefault: () => { prevented = true } }
  for (const fn of win.on.get(type) ?? []) fn(e)
  return prevented
}

/** The stage's engine with its still trigger; `blocked` is the lab's answer. */
function rig(blocked: () => string | null) {
  const take = vi.fn(async () => {})
  const engine = new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false, onStill: stillTrigger({ blocked, take }) })
  const canvas = fakeTarget() as unknown as HTMLCanvasElement
  const stage = { renderer: { domElement: canvas } } as Parameters<typeof operatorInput>[0]
  return { engine, take, stage }
}

const pose = (v: PerspectiveCamera) => [...v.position.toArray(), ...v.quaternion.toArray(), v.fov]

describe('Operator mode off the set\'s page', () => {
  it('Develop: T attaches to nothing, so no still is taken (even with the trigger otherwise free)', () => {
    const { engine, take, stage } = rig(() => null)
    const detach = operatorInput(stage, engine, false)
    expect(win.count()).toBe(0)
    key('keydown', 'KeyT')
    for (let i = 0; i < 5; i++) engine.tick(FRAME, ASPECT)
    expect(take).not.toHaveBeenCalled()
    detach()
  })

  it('control: on Shoot the same T takes exactly one still (none while the key is off, Wave A)', () => {
    const { engine, take, stage } = rig(() => offStage(true, null))
    const detach = operatorInput(stage, engine, true)
    key('keydown', 'KeyT')
    engine.tick(FRAME, ASPECT)
    expect(take).toHaveBeenCalledTimes(STILL_KEY_ENABLED ? 1 : 0)
    detach()
    expect(win.count()).toBe(0)
  })

  it('off the page the trigger refuses on its own and says why (a pad press, or any other way in)', () => {
    const { engine, take } = rig(() => offStage(false, null))
    const detach = engine.attach(fakeTarget() as unknown as HTMLElement)
    key('keydown', 'KeyT')
    engine.tick(FRAME, ASPECT)
    expect(take).not.toHaveBeenCalled()
    expect(engine.message).toBe(STILL_KEY_ENABLED ? OFF_STAGE : STILL_KEY_OFF)
    detach()
  })

  it('Render: Tab and Space are the page\'s (not swallowed), R does not record', () => {
    const { engine, stage } = rig(() => null)
    const detach = operatorInput(stage, engine, false)
    expect(key('keydown', 'Tab')).toBe(false)
    expect(key('keydown', 'Space')).toBe(false)
    key('keydown', 'KeyR')
    engine.tick(FRAME, ASPECT)
    expect(engine.deck.recording).toBe(false)
    detach()
  })

  it('Shoot: Tab from the viewport is not swallowed (focus can leave it) and does not change the rig; 1-5 still does', () => {
    const { engine, stage } = rig(() => null)
    const detach = operatorInput(stage, engine, true)
    const rigBefore = engine.rigId
    expect(key('keydown', 'Tab')).toBe(false)
    engine.tick(FRAME, ASPECT)
    expect(engine.rigId).toBe(rigBefore)
    key('keydown', 'Digit2')
    engine.tick(FRAME, ASPECT)
    expect(engine.rigId).not.toBe(rigBefore)
    detach()
  })

  it('back on Shoot the input returns with no camera jump; a key held at the switch does not keep flying', () => {
    const { engine, stage } = rig(() => null)
    const view = stageView()
    takeOverView(engine, view)
    const drive = operatorDriver(engine, view, () => {})
    let detach = operatorInput(stage, engine, true) // Shoot
    key('keydown', 'KeyW')
    detach() // -> Render, W still down
    detach = operatorInput(stage, engine, false)
    const held = pose(view)
    for (let i = 0; i < 60; i++) drive(FRAME)
    expect(pose(view)).toEqual(held)
    detach()
    detach = operatorInput(stage, engine, true) // -> Shoot
    for (let i = 0; i < 60; i++) drive(FRAME)
    expect(pose(view)).toEqual(held)
    key('keydown', 'KeyW')
    for (let i = 0; i < 30; i++) drive(FRAME)
    expect(pose(view)).not.toEqual(held) // input is live again
    detach()
  })
})

describe('Shoot: keys aimed at a page control are the control\'s', () => {
  const controls = {
    select: { tagName: 'SELECT' }, button: { tagName: 'BUTTON' }, number: { tagName: 'INPUT', type: 'number' },
    editable: { tagName: 'DIV', isContentEditable: true },
  }
  for (const [name, target] of Object.entries(controls)) {
    it(`${name}: T takes no still, Tab still moves focus, W does not fly`, () => {
      const { engine, take, stage } = rig(() => null)
      const view = stageView()
      takeOverView(engine, view)
      const drive = operatorDriver(engine, view, () => {})
      const detach = operatorInput(stage, engine, true)
      const before = pose(view)
      key('keydown', 'KeyT', target)
      expect(key('keydown', 'Tab', target)).toBe(false)
      key('keydown', 'KeyW', target)
      for (let i = 0; i < 30; i++) drive(FRAME)
      expect(take).not.toHaveBeenCalled()
      expect(pose(view)).toEqual(before)
      detach()
    })
  }
})

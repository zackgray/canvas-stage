import { Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { OperatorEngine, type EngineOptions } from '../engine/engine'
import { RIG_IDS, emptyInput, type Action } from '../input/types'
import type { OrbitRig } from '../rigs/orbitRig'

/** Engine with scripted input: `press` queues actions for the next tick. */
function scripted(options?: EngineOptions) {
  const engine = new OperatorEngine(options)
  const queued: Action[] = []
  engine.hub.poll = () => {
    engine.hub.state = { ...emptyInput(), actions: new Set(queued.splice(0)) }
    return engine.hub.state
  }
  const press = (...a: Action[]) => { queued.push(...a); engine.tick(1 / 60, 16 / 9) }
  return { engine, press }
}

describe('engine defaults are the controller lab', () => {
  it('all rigs, follow first, car shown', () => {
    const { engine } = scripted()
    expect(engine.rigIds).toEqual(RIG_IDS)
    expect(engine.rigId).toBe('follow')
    expect(engine.hasCar).toBe(true)
  })

  it('rig keys and Tab reach every rig, in RIG_IDS order', () => {
    const { engine, press } = scripted()
    press('rigNext')
    expect(engine.rigId).toBe('free')
    press('rigPrev')
    expect(engine.rigId).toBe('follow')
    press('rig:dolly')
    expect(engine.rigId).toBe('dolly')
  })

  it('the orbit rig circles the car, and C re-targets the car', () => {
    const { engine, press } = scripted()
    press('rig:orbit')
    const orbit = engine.rigs.orbit as OrbitRig
    expect(orbit.target.distanceTo(engine.carAim)).toBe(0)
    press('playPause')
    for (let i = 0; i < 60; i++) press()
    const aim = engine.carAim.clone() // actions run before this frame's car update
    press('recenter')
    expect(orbit.target.distanceTo(aim)).toBe(0)
    expect(aim.distanceTo(engine.carAim)).toBeGreaterThan(0) // the car did move
  })

  it('a still is logged with the timeline time', () => {
    const { engine, press } = scripted()
    press('still')
    expect(engine.stills).toHaveLength(1)
    expect(engine.message).toBe('Still #1 at 0.00 s')
  })
})

describe('engine options for a car-free set', () => {
  const pivot = new Vector3(1, 0.5, -6)
  const stage = (): EngineOptions => ({ rigs: ['free', 'dolly', 'crane', 'orbit'], rig: 'free', car: false, orbitTarget: () => pivot })

  it('rigs not on offer cannot be chosen by key, Tab or call', () => {
    const { engine, press } = scripted(stage())
    expect(engine.rigId).toBe('free')
    expect(engine.hasCar).toBe(false)
    press('rig:follow')
    expect(engine.rigId).toBe('free')
    engine.setRig('follow')
    expect(engine.rigId).toBe('free')
    press('rig:orbit')
    press('rigNext')
    expect(engine.rigId).toBe('free') // wraps past the missing follow rig
    press('rigPrev')
    expect(engine.rigId).toBe('orbit')
  })

  it('the orbit rig circles the host target, and C re-targets it', () => {
    const { engine, press } = scripted(stage())
    press('rig:orbit')
    const orbit = engine.rigs.orbit as OrbitRig
    expect(orbit.target.distanceTo(pivot)).toBe(0)
    orbit.target.set(0, 0, 0)
    press('recenter')
    expect(orbit.target.distanceTo(pivot)).toBe(0)
  })

  it('the host target is read only when the orbit rig enters or re-targets, never per tick', () => {
    let calls = 0
    const { engine, press } = scripted({ ...stage(), orbitTarget: () => { calls++; return pivot } })
    for (let i = 0; i < 120; i++) press()
    expect(calls).toBe(0) // free rig: no orbit target needed
    press('rig:orbit')
    expect(calls).toBe(1) // entering the orbit rig
    const orbit = engine.rigs.orbit as OrbitRig
    expect(orbit.target.distanceTo(pivot)).toBe(0)
    for (let i = 0; i < 120; i++) press()
    expect(calls).toBe(1)
    press('recenter')
    expect(calls).toBe(2)
    engine.takeOver(new Vector3(0, 1.5, 3), new Quaternion(), 35)
    press()
    expect(calls).toBe(3) // a take-over re-enters the rig
    for (let i = 0; i < 120; i++) press()
    expect(calls).toBe(3)
  })

  it('takeOver starts the rig and stabiliser at the given pose and clamps the lens', () => {
    const { engine, press } = scripted(stage())
    const p = new Vector3(0.3, 1.5, 0.2)
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.4)
    expect(engine.takeOver(p, q, 8)).toBe(12) // the zoom's wide end is 12 mm
    for (let i = 0; i < 30; i++) press()
    expect(engine.out.position.distanceTo(p)).toBeLessThan(1e-12)
    expect(engine.out.quaternion.angleTo(q)).toBeLessThan(1e-7)
    expect(engine.out.focal).toBe(12)
  })
})

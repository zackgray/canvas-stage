// Loop on the world clock in Operator mode: playing wraps the world (the car with it) and keeps going, but a take (R)
// always records the world once from 0 to the end and stops there; a looping clock picks up again after it. Playing a take
// back is the take's own: with Loop off it runs once and stops at its end; with Loop on it replays (owner 2026-10-28: Loop
// actually loops the last take — the engine rewinds the playback and the world clock with it).
import { describe, expect, it } from 'vitest'
import { emptyInput, type InputState } from '../../controller/input/types'
import { loopKey } from '../ui/loopKey'
import type { CarPath } from '../world/path'
import { depthOf, FACADE, GROUND, projectorCam } from '../world/testGround'
import { World } from '../world/World'
import { STAGE_RIGS } from './link'
import { StageOperatorEngine } from './stageEngine'
import { ASPECT, FRAME } from './testRig'

const PATH: CarPath = { start: [-14, 0, -6], end: [1, 0, -6], speed: 'drive', arrival: 'stop', delay: 0 }

function rig(loop = true) {
  const world = new World(async () => ({ missing: 'test' }))
  const v = depthOf(projectorCam(), [{ plane: GROUND }, FACADE])
  world.fitGround(v, v.cam.quaternion)
  world.addCar(PATH)
  world.clock.loop = loop
  const engine = new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false })
  engine.deck.recorder.capSeconds = 120
  const input: InputState = emptyInput()
  engine.hub.poll = () => {
    engine.hub.state = { ...input, actions: new Set(input.actions) }
    input.actions.clear()
    return engine.hub.state
  }
  engine.bind(world, () => ASPECT)
  /** one stage frame in Operator mode: the driver ticks the engine, then the world poses */
  const frame = () => { engine.tick(FRAME, ASPECT); world.frame(0) }
  /** frames until the take ends (bounded) */
  const recordToEnd = () => { for (let n = 0; engine.deck.recording && n < 60 * 120; n++) frame() }
  return { world, engine, input, frame, recordToEnd }
}

describe('Loop in Operator mode', () => {
  it('Space plays through the end and wraps, the car with it', () => {
    const { world, input, frame } = rig()
    world.clock.scrub(world.clock.duration - 0.5)
    input.actions.add('playPause')
    for (let i = 0; i < 60; i++) frame()
    expect(world.clock.playing).toBe(true)
    expect(world.clock.time).toBeCloseTo(0.5, 6)
    expect(world.car!.root.position.x).toBeCloseTo(world.carPose(world.clock.time)!.position[0], 6)
  })

  it('R records once from 0 to the end (no wrap in the samples or the world track), then the loop resumes', () => {
    const { world, engine, frame, recordToEnd } = rig()
    const d = world.clock.duration
    world.clock.toggle()
    engine.toggleRecording()
    recordToEnd()
    expect(engine.deck.recording).toBe(false)
    const take = engine.deck.take!
    expect(take.raw.timelineStart).toBe(0)
    const ts = take.raw.samples.map((s) => s.t)
    ts.slice(1).forEach((t, i) => expect(t).toBeGreaterThan(ts[i]))
    expect(ts.at(-1)!).toBeGreaterThan(d - 0.1)
    expect(ts.at(-1)!).toBeLessThanOrEqual(d + 1e-6)
    const xs = take.worldTrack!.objects[0].samples.map((s) => s.position[0])
    xs.slice(1).forEach((x, i) => expect(x).toBeGreaterThanOrEqual(xs[i] - 1e-9)) // the car never jumps back
    expect(xs.at(-1)!).toBeCloseTo(1, 3)
    expect(engine.deck.takeCount).toBe(1)
    // the take is over and the world loops on from 0
    expect(world.clock.playing).toBe(true)
    expect(world.clock.time).toBe(0)
    frame()
    expect(world.clock.time).toBeCloseTo(FRAME, 9)
  })

  it('Loop off: the take ends with the clock stopped at its end (as before)', () => {
    const { world, engine, recordToEnd } = rig(false)
    engine.toggleRecording()
    recordToEnd()
    expect(engine.deck.recording).toBe(false)
    expect(world.clock.playing).toBe(false)
    expect(world.clock.time).toBe(world.clock.duration)
  })

  it('Space mid-take stops the take and the clock stays paused', () => {
    const { world, engine, input, frame } = rig()
    engine.toggleRecording()
    for (let i = 0; i < 30; i++) frame()
    input.actions.add('playPause')
    frame()
    expect(engine.deck.recording).toBe(false)
    expect(world.clock.playing).toBe(false)
    expect(world.clock.time).toBeCloseTo(30 * FRAME, 6)
  })

  it('R again mid-take: the take stops and the looping clock plays on', () => {
    const { world, engine, frame } = rig()
    engine.toggleRecording()
    for (let i = 0; i < 30; i++) frame()
    engine.toggleRecording()
    expect(engine.deck.recording).toBe(false)
    expect(world.clock.playing).toBe(true)
    frame()
    expect(world.clock.time).toBeCloseTo(31 * FRAME, 6)
  })

  it('playing a take back runs the world once with Loop off and stops at its end (as before)', () => {
    const { world, engine, frame, recordToEnd } = rig(false)
    engine.toggleRecording()
    recordToEnd()
    engine.playTake('raw')
    expect(engine.deck.playback).not.toBeNull()
    let last = world.clock.time
    for (let n = 0; engine.deck.playback && n < 60 * 120; n++) {
      frame()
      if (engine.deck.playback) expect(world.clock.time).toBeGreaterThanOrEqual(last)
      last = world.clock.time
    }
    expect(engine.deck.playback).toBeNull()
    expect(world.clock.playing).toBe(false)
  })

  it('with Loop on, the take plays again instead of ending: the world clock back at the take\'s start, still playing', () => {
    const { world, engine, frame, recordToEnd } = rig()
    engine.toggleRecording()
    recordToEnd()
    const take = engine.deck.take!
    const end = take.raw.samples.at(-1)!.t
    engine.playTake('raw')
    expect(engine.deck.playback).not.toBeNull()
    // run a second past the take's end: Loop rewinds the take (and the world with it) instead of stopping the replay
    for (let n = 0; n < Math.ceil((end + 1) / FRAME) && engine.deck.playback; n++) frame()
    expect(engine.deck.playback).not.toBeNull()
    expect(engine.deck.playback!.t).toBeLessThan(end)
    expect(world.clock.playing).toBe(true)
    expect(world.clock.time).toBeLessThan(world.clock.duration)
  })
})

describe('Loop key', () => {
  const key = (o: Partial<KeyboardEvent> = {}) =>
    ({ code: 'KeyL', repeat: false, ctrlKey: false, metaKey: false, altKey: false, target: null, ...o })

  it('L toggles Loop; not on repeat, with a modifier, in a control, or for other keys', () => {
    const world = new World(async () => ({ missing: 'test' }))
    expect(world.clock.loop).toBe(true)
    expect(loopKey(world, key())).toBe(true)
    expect(world.clock.loop).toBe(false)
    const input = { tagName: 'INPUT' } as unknown as EventTarget
    for (const o of [{ repeat: true }, { ctrlKey: true }, { code: 'KeyK' }, { target: input }]) expect(loopKey(world, key(o))).toBe(false)
    expect(world.clock.loop).toBe(false)
  })
})

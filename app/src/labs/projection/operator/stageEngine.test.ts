// Record starts the world clock: recording a take in Operator mode plays the world from 0 (so every take holds the
// whole action), and the take stores the car's pose per raw sample on the take clock.
import { describe, expect, it } from 'vitest'
import { emptyInput, type InputState } from '../../controller/input/types'
import { takeToJson } from '../../controller/take/processTake'
import { poseAt, type CarPath } from '../world/path'
import { depthOf, FACADE, GROUND, projectorCam } from '../world/testGround'
import { NO_WORLD } from '../../../../server/clip/pose.ts'
import { World } from '../world/World'
import { STAGE_RIGS } from './link'
import { StageOperatorEngine } from './stageEngine'
import { ASPECT, FRAME } from './testRig'

const PATH: CarPath = { start: [-14, 0, -6], end: [1, 0, -6], speed: 'drive', arrival: 'stop', delay: 0 }

function rig(withCar = true) {
  const world = new World(async () => ({ missing: 'test' }))
  if (withCar) {
    const v = depthOf(projectorCam(), [{ plane: GROUND }, FACADE])
    world.fitGround(v, v.cam.quaternion)
    world.addCar(PATH)
  }
  const engine = new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false })
  const input: InputState = emptyInput()
  engine.hub.poll = () => {
    engine.hub.state = { ...input, actions: new Set(input.actions) }
    input.actions.clear()
    return engine.hub.state
  }
  engine.bind(world, () => ASPECT)
  /** one stage frame in Operator mode: the driver ticks the engine, then the world poses (dt 0: the engine advanced it) */
  const frame = () => { engine.tick(FRAME, ASPECT); world.frame(0) }
  return { world, engine, input, frame }
}

describe('Operator mode on the world clock', () => {
  it('the engine timeline is the world clock: play / scrub move the car', () => {
    const { world, engine, input, frame } = rig()
    expect(engine.timeline).toBe(world.clock)
    input.actions.add('playPause')
    for (let i = 0; i < 60; i++) frame()
    expect(world.clock.time).toBeCloseTo(1, 6)
    expect(world.car!.root.position.x).toBeCloseTo(poseAt(world.path!, world.clock.time).position[0], 6)
  })

  it('record rewinds the world to 0 and plays it, wherever the clock was', () => {
    const { world, engine, frame } = rig()
    world.clock.scrub(3.2)
    engine.toggleRecording()
    expect(world.clock.time).toBe(0)
    expect(world.clock.playing).toBe(true)
    frame()
    expect(world.clock.time).toBeCloseTo(FRAME, 9)
  })

  it('the take stores the car per raw sample, on the take clock, and exports it in the take JSON', () => {
    const { world, engine, frame } = rig()
    world.clock.scrub(2)
    engine.toggleRecording()
    for (let i = 0; i < 90; i++) frame() // 1.5 s
    engine.stopRecording()
    const take = engine.deck.take!
    expect(take.raw.timelineStart).toBe(0)
    const car = take.worldTrack!.objects[0]
    expect(car.id).toBe('car')
    expect(car.samples).toHaveLength(take.raw.samples.length)
    car.samples.forEach((s, i) => {
      expect(s.t).toBeCloseTo(take.raw.samples[i].t, 4)
      expect(s.position[0]).toBeCloseTo(poseAt(world.path!, take.raw.timelineStart + s.t).position[0], 3)
    })
    expect(car.samples.at(-1)!.speed).toBeGreaterThan(0)
    expect(takeToJson(take).worldTrack).toBe(take.worldTrack)
  })

  it('no car: the take has no world track (and the JSON no key)', () => {
    const { engine, frame } = rig(false)
    engine.toggleRecording()
    for (let i = 0; i < 30; i++) frame()
    engine.stopRecording()
    expect(engine.deck.take!.worldTrack).toBeUndefined()
    expect('worldTrack' in takeToJson(engine.deck.take!)).toBe(false)
    expect(engine.deck.take!.trackHash).toBe(NO_WORLD)
  })

  it('the take records the world\'s track hash it was made with (the clip gate compares a still\'s with it)', () => {
    const { world, engine, frame } = rig()
    engine.toggleRecording()
    for (let i = 0; i < 30; i++) frame()
    engine.stopRecording()
    expect(engine.deck.take!.trackHash).toBe(world.trackHash)
    expect(engine.deck.take!.trackHash).toMatch(/^car-/)
  })

  it('the clock reaching its end stops the take (the controller lab\'s rule), with the track to that point', () => {
    const { world, engine, frame } = rig()
    engine.deck.recorder.capSeconds = 15
    engine.toggleRecording()
    for (let i = 0; i < 60 * 20 && engine.deck.recording; i++) frame()
    expect(engine.deck.recording).toBe(false)
    const take = engine.deck.take!
    expect(take.raw.samples.at(-1)!.t).toBeLessThanOrEqual(world.clock.duration + 1e-6)
    expect(take.worldTrack!.objects[0].samples.at(-1)!.position[0]).toBeCloseTo(1, 3) // stopped at the end
  })
})

// The take cap follows the performance on the world clock: a 193-frame pack (8.04 s) records whole; none = 5 s.
import { Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CAP_SECONDS } from '../../controller/take/recorder'
import { World } from '../world/World'
import { STAGE_RIGS } from './link'
import { StageOperatorEngine } from './stageEngine'
import { ASPECT, FRAME } from './testRig'

const PACK_SECONDS = 193 / 24

function rig(withPerformance: boolean) {
  const world = new World(async () => ({ missing: 'test' }))
  if (withPerformance) world.setPerformance({ object: new Object3D(), duration: PACK_SECONDS, pose: () => {} })
  const engine = new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false })
  engine.bind(world, () => ASPECT)
  const frame = () => { engine.tick(FRAME, ASPECT); world.frame(0) }
  return { engine, frame }
}

describe('take cap from the performance', () => {
  it('a 193-frame pack records its 8.04 s without the cap firing', () => {
    const { engine, frame } = rig(true)
    frame()
    expect(engine.deck.recorder.capSeconds).toBeCloseTo(PACK_SECONDS, 9)
    engine.toggleRecording()
    for (let i = 0; i < 60 * 6; i++) frame() // 6 s: past the old 5 s cap
    expect(engine.deck.recording).toBe(true)
    for (let i = 0; i < 60 * 3; i++) frame()
    expect(engine.deck.recording).toBe(false) // stopped at the end of the clip, not at 5 s
    const t = engine.deck.take!.raw.samples
    expect(t[t.length - 1].t).toBeCloseTo(PACK_SECONDS, 1)
    expect(engine.deck.take!.raw.capSeconds).toBeCloseTo(PACK_SECONDS, 9)
  })

  it('falls back to 5 s with no performance', () => {
    const { engine, frame } = rig(false)
    frame()
    expect(engine.deck.recorder.capSeconds).toBe(DEFAULT_CAP_SECONDS)
    engine.toggleRecording()
    for (let i = 0; i < 60 * 6; i++) frame()
    expect(engine.deck.recording).toBe(false)
    const t = engine.deck.take!.raw.samples
    expect(t[t.length - 1].t).toBeCloseTo(5, 1)
  })

  it('a cap the user typed in wins over the default', () => {
    const { engine, frame } = rig(true)
    engine.deck.recorder.capSeconds = 3
    frame()
    expect(engine.deck.recorder.capSeconds).toBe(3)
  })
})

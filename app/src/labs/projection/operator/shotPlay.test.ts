// Owner 2026-10-28: Play ran the action alone. A camera move played only through the Camera panel's Preview, and a locked take's
// recorded flight never replayed (the camera sat on its first sample). Play is the shot's now: the engine's playPause runs the plan
// the Stage hands it (the picked move, the take's own samples, the take in memory) with the world clock from the take's start; Stop
// (Play again, Space, the pad's play button) ends both with the camera back at the shot's start.
import { Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { WorldClock } from '../world/clock'
import type { World } from '../world/World'
import type { CameraSample } from '../../controller/take/types'
import { emptyInput } from '../../controller/input/types'
import { STAGE_RIGS } from './link'
import { shotPlaying, type ShotPlan } from './shotPlay'
import { StageOperatorEngine } from './stageEngine'

function hosted() {
  const e = new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false, orbitTarget: () => new Vector3(0, 1.6, 0) })
  const clock = new WorldClock()
  clock.setDuration(6)
  clock.loop = false // these are Play/Stop's tests: a replay ends when it ends (Loop's replay is loop.test.ts's)
  e.bind({ clock, performance: null, sources: () => [], trackHash: '' } as unknown as World, () => 16 / 9)
  e.takeOver(new Vector3(0, 1.6, 6), new Quaternion(), 35)
  return { e, clock }
}
const tick = (e: StageOperatorEngine, secs: number) => { for (let t = 0; t < secs - 1e-9; t += 1 / 60) e.tick(1 / 60, 16 / 9) }
/** a flown take: 2 m to the right over 2 s, a little up */
const flight: CameraSample[] = Array.from({ length: 49 }, (_, k) => ({ t: k / 24, position: [-3 + k / 24, 1.5 + k / 240, 4], quaternion: [0, 0, 0, 1], focal: 35, focus: 5 }))
const at = (e: StageOperatorEngine) => e.out.position.toArray().map((n) => Math.round(n * 100) / 100)

describe('Play plays the shot', () => {
  it('a locked take: the camera flies its own recorded path with the action, from the take start; its end comes back to the start', () => {
    const { e, clock } = hosted()
    e.shotPlan = () => ({ kind: 'take', samples: flight, start: 0 })
    clock.time = 3
    e.playPause()
    expect(shotPlaying(e)).toBe(true)
    expect(clock.time).toBe(0)
    expect(clock.playing).toBe(true)
    tick(e, 1)
    expect(at(e)).toEqual([-2, 1.6, 4]) // a second into the flight, not its first sample
    expect(clock.time).toBeCloseTo(1, 1)
    tick(e, 1.5)
    expect(shotPlaying(e)).toBe(false)
    expect(at(e)).toEqual([-3, 1.5, 4]) // over: back on the saved camera, where the take starts
    expect(clock.playing).toBe(false)
  })

  it('Play again (Stop) ends the replay at once, the camera back at the start and the clock paused', () => {
    const { e, clock } = hosted()
    e.shotPlan = () => ({ kind: 'take', samples: flight, start: 0 })
    e.playPause()
    tick(e, 0.5)
    e.playPause()
    expect(shotPlaying(e)).toBe(false)
    expect(at(e)).toEqual([-3, 1.5, 4])
    expect(clock.playing).toBe(false)
  })

  it('the picked move: Play runs it with the action and films nothing; Space during it stops it, the camera back on its frame 0', () => {
    const { e, clock } = hosted()
    const plan: ShotPlan = { kind: 'move', id: 'crane', seconds: 2, hold: false }
    e.shotPlan = () => plan
    e.playPause()
    expect(e.move?.id).toBe('crane')
    expect(e.move?.record).toBe(false)
    expect(clock.playing).toBe(true)
    tick(e, 1)
    expect(e.out.position.y).toBeGreaterThan(2) // the crane is rising
    e.hub.poll = () => ({ ...emptyInput(), actions: new Set(['playPause'] as const) })
    e.tick(1 / 60, 16 / 9) // Space / the pad's play button
    expect(e.move).toBeNull()
    expect(at(e)).toEqual([0, 1.6, 6])
    expect(e.deck.takeCount).toBe(0)
  })

  it('the take in memory replays when the plan says so; no plan (or a take recording) is the world clock alone', () => {
    const { e, clock } = hosted()
    e.startPreset('pull', 2, true)
    for (let i = 0; i < 400 && e.move; i++) e.tick(1 / 60, 16 / 9)
    expect(e.deck.take).not.toBeNull()
    clock.playing = false // a looping clock picks up again after a take: paused here, as after a press of Pause
    e.shotPlan = () => ({ kind: 'memory' })
    e.playPause()
    expect(e.deck.playback).not.toBeNull()
    e.playPause()
    e.shotPlan = () => null
    e.playPause()
    expect(shotPlaying(e)).toBe(false)
    expect(clock.playing).toBe(true) // the action alone
    e.playPause()
    expect(clock.playing).toBe(false)
  })

  it('a running clock pauses first: Play over the action alone is a pause, never a camera move starting', () => {
    const { e, clock } = hosted()
    e.shotPlan = () => ({ kind: 'move', id: 'push', seconds: 2, hold: false })
    clock.playing = true
    e.playPause()
    expect(e.move).toBeNull()
    expect(clock.playing).toBe(false)
  })
})

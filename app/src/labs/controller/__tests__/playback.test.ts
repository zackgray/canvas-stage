// The take's playback on the engine (camera-take-playback): with Loop on the take replays instead of ending — the playback
// rewinds and the world clock goes back to the take's start, the camera on its first samples again; with Loop off the replay
// ends as before and the clock stops. The scrub bar's seek moves the playback time and the clock with it, clamped to the take.
import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { OperatorEngine } from '../engine/engine'
import type { CameraSample } from '../take/types'

/** a flown take: 2 m to the right over 2 s, a little up */
const flight: CameraSample[] = Array.from({ length: 49 }, (_, k) => ({ t: k / 24, position: [-3 + k / 24, 1.5 + k / 240, 4], quaternion: [0, 0, 0, 1], focal: 35, focus: 5 }))

function hosted(loop: boolean) {
  const e = new OperatorEngine({ rigs: ['free', 'dolly', 'crane', 'orbit'], rig: 'free', car: false })
  e.timeline.duration = 6
  e.timeline.loop = loop
  e.takeOver(new Vector3(0, 1.6, 6), new Quaternion(), 35)
  return e
}
const tick = (e: OperatorEngine, secs: number) => { for (let t = 0; t < secs - 1e-9; t += 1 / 60) e.tick(1 / 60, 16 / 9) }

describe('take playback', () => {
  it('Loop off: the replay ends at the take\'s end — the playback cleared, the clock paused', () => {
    const e = hosted(false)
    e.playRecord(flight, 0)
    expect(e.deck.playback).not.toBeNull()
    tick(e, 2.2)
    expect(e.deck.playback).toBeNull()
    expect(e.timeline.playing).toBe(false)
    expect(e.deck.playbackEnd()).toBeNull()
  })

  it('Loop on: the take plays again — the playback rewinds, the clock back at the take\'s start, the camera on its first samples', () => {
    const e = hosted(true)
    e.playRecord(flight, 0)
    tick(e, 2.1) // a tenth past the take's 2 s end
    expect(e.deck.playback).not.toBeNull()
    expect(e.deck.playback!.t).toBeLessThan(0.5) // rewound, replaying the start
    expect(e.timeline.playing).toBe(true)
    expect(e.timeline.time).toBeLessThan(1)
    expect(e.out.position.x).toBeLessThan(-2.5) // near the flight's first metre again, not its last (-1)
  })

  it('the scrub seek moves the playback time and the clock with it, clamped to the take', () => {
    const e = hosted(false)
    e.playRecord(flight, 1) // from 1 s on the clock
    tick(e, 0.5)
    e.seekPlayback(1.75)
    expect(e.deck.playback!.t).toBeCloseTo(1.75, 6)
    expect(e.timeline.time).toBeCloseTo(2.75, 6)
    e.seekPlayback(99)
    expect(e.deck.playback!.t).toBeCloseTo(2, 6) // the take's last sample, not past it
    expect(e.timeline.time).toBeCloseTo(3, 6)
  })

  it('nothing playing: rewind and seek are no-ops', () => {
    const e = hosted(true)
    expect(e.deck.rewind()).toBe(false)
    e.seekPlayback(1)
    expect(e.timeline.time).toBe(0)
  })
})

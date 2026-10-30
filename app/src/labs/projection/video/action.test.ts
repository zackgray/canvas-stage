import { describe, expect, it } from 'vitest'
import { describeAction } from './action'
import { FPS, RAD, take } from './__tests__/takes'
import { car, easeToStop, world } from './__tests__/worlds'

// Eye height at the origin looking down -Z, 35 mm: at 10 m the frame is about +-5.1 m wide.
const still = take(4, () => ({}))
const one = (w: ReturnType<typeof world>, cams = still, landmark?: string) => describeAction(w, cams, FPS, { landmark }).objects[0]

describe('describeAction', () => {
  it('a car that moves in from the left and stops centre-frame', () => {
    const o = one(world(car(4, (t) => [easeToStop(-15, 15, 3)(t), 0.7, -10])))
    expect(o).toMatchObject({ moving: true, visible: true, inFrameAtStart: false, startsAtRest: false, exit: null, direction: 'left-to-right', speed: 'moves' })
    expect(o.enter?.side).toBe('left')
    expect(o.enter?.t).toBeGreaterThan(0.5)
    expect(o.stop).toMatchObject({ inFrame: true, place: 'centre', landmark: null })
    expect(o.stop?.t).toBeCloseTo(3, 0)
  })

  it('reads the entry side from the screen, not the world: the same car seen by a camera turned round enters from the right', () => {
    // Facing +Z (yaw 180 deg), world -X is on screen right.
    const back = take(4, () => ({ yaw: 180 * RAD }))
    const o = one(world(car(4, (t) => [easeToStop(-15, 15, 3)(t), 0.7, 10])), back)
    expect(o.enter?.side).toBe('right')
    expect(o.direction).toBe('right-to-left')
    expect(one(world(car(4, (t) => [easeToStop(15, -15, 3)(t), 0.7, -10]))).enter?.side).toBe('right')
  })

  it('a car that drives straight through, left to right', () => {
    const o = one(world(car(4, (t) => [-15 + 8 * t, 0.7, -10])))
    expect(o.enter?.side).toBe('left')
    expect(o.exit?.side).toBe('right')
    expect(o.exit!.t).toBeGreaterThan(o.enter!.t)
    expect(o).toMatchObject({ stop: null, direction: 'left-to-right', speed: 'moves', pacing: 'steady' })
    expect(o.meanSpeed).toBeCloseTo(8, 6)
  })

  it('a car that comes out of the distance toward the camera enters from depth', () => {
    const o = one(world(car(4, (t) => [1.5, 0.7, -80 + 10 * t])))
    expect(o.enter?.side).toBe('depth')
    expect(o.direction).toBe('toward')
    // The same entry from the track's own visible fraction (a car round a corner: on screen, but hidden until 1 s).
    const hidden = one(world(car(4, (t) => [1.5, 0.7, -40 + 5 * t], { visible: (t) => (t < 1 ? 0 : 1) })))
    expect(hidden.enter).toMatchObject({ side: 'depth' })
    expect(hidden.enter!.t).toBeCloseTo(1, 1)
  })

  it('a car already in frame at the start that pulls away and moves off to the right', () => {
    const o = one(world(car(4, (t) => [2 * t * t, 0.7, -10])))
    expect(o).toMatchObject({ inFrameAtStart: true, startsAtRest: true, enter: null, stop: null, pacing: 'accelerating', direction: 'left-to-right' })
    expect(o.exit?.side).toBe('right')
  })

  it('a parked car is visible but not moving, so it has no action', () => {
    const o = one(world(car(4, () => [1, 0.7, -10])))
    expect(o).toMatchObject({ visible: true, moving: false, speed: null, direction: null, enter: null, exit: null, stop: null })
  })

  it('a car that never comes into frame is not visible', () => {
    expect(one(world(car(4, (t) => [-40 + 2 * t, 0.7, -10]))).visible).toBe(false)
  })

  it('a camera panning right to follow keeps the stop in frame, and a landmark names the stop', () => {
    const pan = take(4, (u) => ({ yaw: -15 * RAD * Math.min(1, u * 4 / 3) }))
    const o = one(world(car(4, (t) => [easeToStop(-15, 18, 3)(t), 0.7, -10])), pan, 'in front of the bank steps')
    expect(o.enter?.side).toBe('left')
    expect(o.stop).toMatchObject({ inFrame: true, place: 'centre', landmark: 'in front of the bank steps' })
  })

  it('speed words from mean m/s', () => {
    const at = (v: number) => one(world(car(4, (t) => [-2 + v * t, 0.7, -30]))).speed
    expect([at(1), at(3), at(8), at(14)]).toEqual(['crawls', 'moves slowly', 'moves', 'moves quickly'])
  })

  it('every object is read, in track order, over the camera window only', () => {
    const f = describeAction(world(car(4, () => [1, 0.7, -10], { id: 'a' }), car(4, (t) => [-15 + 8 * t, 0.7, -10], { id: 'b' })), still.slice(0, 25), FPS)
    expect(f.objects.map((o) => o.id)).toEqual(['a', 'b'])
    expect(f.duration).toBeCloseTo(1, 9)
    // In the first second the through-car is still off screen left.
    expect(f.objects[1]).toMatchObject({ visible: false, enter: null })
  })
})

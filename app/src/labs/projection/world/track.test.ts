import { describe, expect, it } from 'vitest'
import type { V3 } from './geom'
import { CAR_BOX } from './car'
import { recordTrack, trackPoseAt, visibleFraction, type FrameCam, type TrackSource } from './track'

/** Camera at the origin looking down -Z, 16:9, 40° vertical. */
const cam = (t = 0): FrameCam => ({ t, position: [0, 1.5, 0], quaternion: [0, 0, 0, 1], vfovDeg: 40, aspect: 16 / 9 })
const across = (x: number) => ({ position: [x, 0, -10] as V3, heading: Math.PI / 2, speed: 8 })
const UP: V3 = [0, 1, 0]

describe('visible fraction', () => {
  it('1 in the middle of frame, 0 behind the camera or far off to the side', () => {
    expect(visibleFraction(cam(), across(0), UP, CAR_BOX)).toBe(1)
    expect(visibleFraction(cam(), { ...across(0), position: [0, 0, 10] }, UP, CAR_BOX)).toBe(0)
    expect(visibleFraction(cam(), across(-40), UP, CAR_BOX)).toBe(0)
  })
  it('about half when the car straddles the left frame edge, rising as it drives in', () => {
    const edge = -10 * Math.tan((40 * Math.PI) / 360) * (16 / 9) // frame edge at 10 m
    const half = visibleFraction(cam(), across(edge), UP, CAR_BOX)
    expect(half).toBeGreaterThan(0.3)
    expect(half).toBeLessThan(0.7)
    const xs = [-20, -14, edge, -5, 0].map((x) => visibleFraction(cam(), across(x), UP, CAR_BOX))
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1])
  })
})

describe('recording the world track', () => {
  const source: TrackSource = { id: 'car', kind: 'car', label: 'a red compact coupe', up: UP, size: CAR_BOX, poseAt: (wt) => across(-20 + 8 * wt) }

  it('samples on the take clock: t from the take start, poses at timelineStart + t', () => {
    const cams = [0, 1 / 24, 2 / 24, 1].map(cam)
    const track = recordTrack([source], cams, 2)
    const o = track.objects[0]
    expect(o).toMatchObject({ id: 'car', kind: 'car', label: 'a red compact coupe' })
    expect(o.samples.map((s) => s.t)).toEqual([0, 0.0417, 0.0833, 1])
    expect(o.samples[3].position[0]).toBeCloseTo(-20 + 8 * 3, 3) // world time 2 + 1
    expect(o.samples[0].heading).toBeCloseTo(Math.PI / 2, 4)
    expect(o.samples[0].speed).toBe(8)
    expect(o.samples.every((s) => s.visibleFraction! >= 0 && s.visibleFraction! <= 1)).toBe(true)
    expect(JSON.parse(JSON.stringify(track))).toEqual(track) // plain JSON
  })

  it('pose from samples: linear between them, held outside', () => {
    const o = recordTrack([source], [0, 1].map(cam), 0).objects[0]
    expect(trackPoseAt(o, 0.5).position[0]).toBeCloseTo(-16, 6)
    expect(trackPoseAt(o, -1).position[0]).toBeCloseTo(-20, 6)
    expect(trackPoseAt(o, 9).position[0]).toBeCloseTo(-12, 6)
  })
})

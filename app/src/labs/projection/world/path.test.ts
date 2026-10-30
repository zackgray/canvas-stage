import { describe, expect, it } from 'vitest'
import { DEFAULT_CAP_SECONDS } from '../../controller/take/recorder'
import type { V3 } from './geom'
import { EXTEND_M, extendStart, motion, nearFrameEdge, pathFromClicks, poseAt, SPEEDS, type CarPath } from './path'
import { dist } from './testGround'

const path = (over: Partial<CarPath> = {}): CarPath => ({ start: [0, 0, 0], end: [40, 0, 0], speed: 'drive', arrival: 'stop', delay: 1, ...over })

describe('path from two clicks', () => {
  it('a start clicked near the frame edge is pushed EXTEND_M out, away from the end, on the same line', () => {
    const a: V3 = [-3, 0, -6], b: V3 = [2, 0, -6]
    const { start, end } = pathFromClicks(a, b, nearFrameEdge({ x: -0.95, y: -0.4 }))
    expect(end).toEqual(b)
    expect(dist(start, a)).toBeCloseTo(EXTEND_M, 9)
    expect(start[0]).toBeCloseTo(-3 - EXTEND_M, 9) // further left: out of frame
    expect(start[2]).toBeCloseTo(-6, 9)
  })
  it('a start clicked inside the frame stays where it was clicked', () => {
    expect(nearFrameEdge({ x: 0.5, y: -0.6 })).toBe(false)
    expect(pathFromClicks([1, 0, 1], [5, 0, 1], false)).toEqual({ start: [1, 0, 1], end: [5, 0, 1] })
    expect(nearFrameEdge({ x: 0.1, y: -0.95 })).toBe(true) // the bottom edge counts too
  })
  it('"start further out" moves the start back along the path', () => {
    const p = extendStart(path(), 5)
    expect(p.start[0]).toBeCloseTo(-5, 9)
    expect(p.end).toEqual([40, 0, 0])
  })
})

describe('car pose on the world clock', () => {
  const { speed: V, accel: a } = SPEEDS.drive

  it('wait: at the start, stopped, facing along the path (+X = heading π/2)', () => {
    const p = poseAt(path(), 0.5)
    expect(p.position).toEqual([0, 0, 0])
    expect(p.speed).toBe(0)
    expect(p.heading).toBeCloseTo(Math.PI / 2, 9)
  })
  it('accelerate: v = a·t, s = a·t²/2 after the wait', () => {
    const p = poseAt(path(), 1 + 1.5)
    expect(p.speed).toBeCloseTo(a * 1.5, 9)
    expect(p.position[0]).toBeCloseTo((a * 1.5 * 1.5) / 2, 9)
  })
  it('cruise at the preset speed, then brake to stop exactly at the end and hold', () => {
    const m = motion(path())
    const tUp = V / a
    expect(poseAt(path(), 1 + tUp + 1).speed).toBeCloseTo(V, 9)
    expect(m.arrive).toBeCloseTo(1 + 2 * tUp + (40 - (V * V) / a) / V, 9)
    const end = poseAt(path(), m.arrive)
    expect(end.position[0]).toBeCloseTo(40, 6)
    expect(end.speed).toBeCloseTo(0, 6)
    expect(poseAt(path(), m.arrive + 3).position[0]).toBeCloseTo(40, 9)
    // never past the end, monotone
    let last = -1
    for (let t = 0; t <= m.duration; t += 0.05) {
      const x = poseAt(path(), t).position[0]
      expect(x).toBeGreaterThanOrEqual(last - 1e-9)
      expect(x).toBeLessThanOrEqual(40 + 1e-9)
      last = x
    }
  })
  it('a path too short to reach cruise peaks at sqrt(a·L) and still stops at its end', () => {
    const short = path({ end: [6, 0, 0], delay: 0 })
    const m = motion(short)
    expect(m.arrive).toBeCloseTo(2 * Math.sqrt(6 / a), 9)
    expect(Math.max(...Array.from({ length: 200 }, (_, i) => poseAt(short, (i / 200) * m.arrive).speed))).toBeLessThanOrEqual(Math.sqrt(a * 6) + 1e-9)
    expect(poseAt(short, m.arrive).position[0]).toBeCloseTo(6, 6)
  })
  it('drive through: reaches the end at cruise speed and keeps going past it', () => {
    const p = path({ arrival: 'through' })
    const m = motion(p)
    expect(poseAt(p, m.arrive).position[0]).toBeCloseTo(40, 6)
    expect(poseAt(p, m.arrive).speed).toBeCloseTo(V, 9)
    expect(poseAt(p, m.arrive + 1).position[0]).toBeCloseTo(40 + V, 6)
  })
  it('the clock runs past the arrival, and at least a full default take', () => {
    expect(motion(path()).duration).toBeGreaterThan(motion(path()).arrive)
    expect(motion(path({ end: [3, 0, 0], delay: 0 })).duration).toBe(DEFAULT_CAP_SECONDS)
  })
})

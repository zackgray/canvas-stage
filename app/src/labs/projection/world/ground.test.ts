import { describe, expect, it } from 'vitest'
import { planeDist, type V3 } from './geom'
import { fitGround, refitAlong, sunDirection } from './ground'
import { angleDeg, depthOf, FACADE, GROUND, projectorCam, tilted } from './testGround'

describe('ground plane fit on synthetic depth', () => {
  it('finds the street under a facade, through 1 cm noise', () => {
    const v = depthOf(projectorCam(), [{ plane: GROUND }, FACADE], 0.01)
    const g = fitGround(v)!
    expect(g).not.toBeNull()
    expect(angleDeg(g.n, [0, 1, 0])).toBeLessThan(0.5)
    expect(Math.abs(g.d)).toBeLessThan(0.01)
    expect(g.inliers / g.samples).toBeGreaterThan(0.9)
  })

  it('follows a tilted street (5°) and is not pulled onto the facade', () => {
    const pl = tilted(5)
    const v = depthOf(projectorCam(), [{ plane: pl }, FACADE])
    const g = fitGround(v)!
    expect(angleDeg(g.n, pl.n)).toBeLessThan(0.2)
    expect(g.tiltDeg).toBeCloseTo(5, 1)
  })

  it('ignores a car-sized box standing on the street (the inliers are the street)', () => {
    const box = { plane: { n: [0, 0, 1] as V3, d: 6 }, keep: (p: V3) => Math.abs(p[0]) < 1 && p[1] < 1.4 && p[1] > 0 }
    const g = fitGround(depthOf(projectorCam(), [{ plane: GROUND }, box, FACADE], 0.005))!
    expect(angleDeg(g.n, [0, 1, 0])).toBeLessThan(0.5)
    expect(Math.abs(g.d)).toBeLessThan(0.01)
  })

  it('null when the bottom of the frame holds no ground (a wall close up)', () => {
    const wall = { plane: { n: [0, 0, 1] as V3, d: 3 } }
    expect(fitGround(depthOf(projectorCam(), [wall]))).toBeNull()
    expect(fitGround(depthOf(projectorCam(), []))).toBeNull()
  })

  it('local refit along the path: the street under the car, not the kerb beside it', () => {
    // street y = 0 for x < 2, a 15 cm pavement for x >= 2: the global fit may straddle; along x = -2 it is the street
    const street = { plane: GROUND, keep: (p: V3) => p[0] < 2 }
    const pavement = { plane: { n: [0, 1, 0] as V3, d: -0.15 }, keep: (p: V3) => p[0] >= 2 }
    const v = depthOf(projectorCam(240, 135), [street, pavement, FACADE])
    const global = fitGround(v)!
    const local = refitAlong(v, global, [-2, 0, -4], [-2, 0, -9])!
    expect(local).not.toBeNull()
    expect(Math.abs(planeDist(local, [-2, 0, -6]))).toBeLessThan(0.005)
    expect(angleDeg(local.n, [0, 1, 0])).toBeLessThan(0.3)
  })

  it('local refit gives up (null) where the path leaves the set', () => {
    const v = depthOf(projectorCam(), [{ plane: GROUND }, FACADE])
    expect(refitAlong(v, fitGround(v)!, [-80, 0, 40], [-90, 0, 40])).toBeNull()
  })

  it('sun: low (22°) above the plane, from camera-left and toward the camera', () => {
    const q = projectorCam().quaternion
    const s = sunDirection(q, [0, 1, 0])
    expect((Math.asin(s[1]) * 180) / Math.PI).toBeCloseTo(22, 5)
    expect(s[0]).toBeLessThan(0) // camera-left (camera looks down -Z, right = +X)
    expect(s[2]).toBeGreaterThan(0) // toward the camera (behind it is +Z)
  })
})

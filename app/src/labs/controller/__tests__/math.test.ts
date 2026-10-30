import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { solveFramingAim } from '../math/framing'
import { focalFromHfov, hfovFromFocal, threeFovDeg, vfovFromHfov, zoomFocal } from '../math/lens'
import { oneEuroPass, oneEuroZeroPhase } from '../math/oneEuro'
import { smoothDamp, wrapAngle } from '../math/spring'

const DEG = 180 / Math.PI

describe('lens maths (36 mm sensor width)', () => {
  it('matches known horizontal FOVs', () => {
    expect(hfovFromFocal(36) * DEG).toBeCloseTo(53.13, 2) // 2·atan(0.5)
    expect(hfovFromFocal(50) * DEG).toBeCloseTo(39.6, 1)
    expect(hfovFromFocal(24) * DEG).toBeCloseTo(73.74, 1)
    expect(hfovFromFocal(85) * DEG).toBeCloseTo(23.9, 1)
  })

  it('round-trips focal <-> FOV', () => {
    for (const f of [24, 35, 50, 85]) expect(focalFromHfov(hfovFromFocal(f))).toBeCloseTo(f, 9)
  })

  it('derives vertical FOV from aspect; 3:2 frame gives the 24 mm sensor height', () => {
    const v = vfovFromHfov(hfovFromFocal(50), 36 / 24)
    expect(v).toBeCloseTo(2 * Math.atan(24 / 100), 9)
    expect(threeFovDeg(50, 1.5)).toBeCloseTo(v * DEG, 9)
  })

  it('zooms multiplicatively and clamps to 12-85 mm (12 mm: about 112.6 degrees across the 36 mm gate)', () => {
    expect(zoomFocal(50, 1, 100)).toBe(85)
    expect(zoomFocal(50, -1, 100)).toBe(12)
    expect(zoomFocal(24, Math.log(0.5), 1)).toBeCloseTo(12, 9) // the old 24 mm floor is no longer a stop
    expect(hfovFromFocal(12) * DEG).toBeCloseTo(112.62, 2) // 2·atan(1.5)
    expect(zoomFocal(50, Math.log(1.2), 1)).toBeCloseTo(60, 9)
  })
})

describe('springs', () => {
  it('smoothDamp converges without overshoot', () => {
    let s = { value: 0, velocity: 0 }
    let max = 0
    for (let i = 0; i < 240; i++) {
      s = smoothDamp(s, 1, 0.3, 1 / 60)
      max = Math.max(max, s.value)
    }
    expect(s.value).toBeCloseTo(1, 3)
    expect(max).toBeLessThanOrEqual(1 + 1e-6)
  })

  it('wrapAngle stays in (-PI, PI]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(-Math.PI, 9)
    expect(wrapAngle(-0.5)).toBeCloseTo(-0.5, 9)
    expect(wrapAngle(2 * Math.PI + 0.25)).toBeCloseTo(0.25, 9)
  })
})

describe('One Euro filter', () => {
  const dt = 1 / 24
  // Deterministic pseudo-noise.
  const noise = (i: number) => Math.sin(i * 12.9898) * 43758.5453 - Math.floor(Math.sin(i * 12.9898) * 43758.5453) - 0.5
  const rms = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length)

  it('reduces jitter on a held position', () => {
    const truth = Array.from({ length: 120 }, () => 2)
    const noisy = truth.map((v, i) => v + noise(i) * 0.1)
    const out = oneEuroZeroPhase(noisy, dt, { minCutoff: 1, beta: 0, dCutoff: 1 })
    expect(rms(out, truth)).toBeLessThan(rms(noisy, truth) * 0.4)
  })

  it('zero-phase pass removes the lag a live (one-way) pass has on a ramp', () => {
    const ramp = Array.from({ length: 120 }, (_, i) => i * dt)
    const live = oneEuroPass(ramp, dt, { minCutoff: 1, beta: 0, dCutoff: 1 })
    const zp = oneEuroZeroPhase(ramp, dt, { minCutoff: 1, beta: 0, dCutoff: 1 })
    const mid = 60
    expect(ramp[mid] - live[mid]).toBeGreaterThan(0.05) // live filter lags
    expect(Math.abs(zp[mid] - ramp[mid])).toBeLessThan(0.01)
  })
})

describe('framing maths', () => {
  const cases = [
    { cam: [0, 1.6, 10], target: [3, 0.8, -5], u: 0.4, v: -0.2, aspect: 16 / 9, f: 35 },
    { cam: [-6, 1.7, 15], target: [-30, 0.8, 3.2], u: -0.5, v: 0.3, aspect: 16 / 9, f: 85 },
    { cam: [2, 8, 2], target: [0, 0, -10], u: 0, v: 0, aspect: 1.5, f: 24 },
    { cam: [0, 0, 0], target: [0, 5, -3], u: 0.2, v: 0.45, aspect: 16 / 9, f: 50 },
  ]
  for (const c of cases) {
    it(`puts the target at (${c.u}, ${c.v}) in frame at ${c.f} mm`, () => {
      const hfov = hfovFromFocal(c.f)
      const vfov = vfovFromHfov(hfov, c.aspect)
      const cam = new PerspectiveCamera(vfov * DEG, c.aspect, 0.1, 1000)
      cam.position.fromArray(c.cam)
      const target = new Vector3().fromArray(c.target)
      const aim = solveFramingAim(cam.position, target, c.u, c.v, hfov, vfov)
      cam.rotation.set(aim.pitch, aim.yaw, 0, 'YXZ')
      cam.updateMatrixWorld()
      const ndc = target.clone().project(cam)
      expect(ndc.x).toBeCloseTo(c.u, 6)
      expect(ndc.y).toBeCloseTo(c.v, 6)
      expect(ndc.z).toBeLessThan(1) // in front of the camera
    })
  }
})

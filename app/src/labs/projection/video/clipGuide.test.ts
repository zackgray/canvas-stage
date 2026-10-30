import { describe, expect, it } from 'vitest'
import { threeFovDeg } from '../../controller/math/lens'
import type { CameraSample } from '../../controller/take/types'
import { cropVfov, GUIDE_ASPECT, guideCameras, guideFrameCount, resampleTake, startPose } from './clipGuide'

/** A take sampled at `fps` for `seconds`: x moves 1 m/s, focal 30 -> 40 mm. */
function take(seconds: number, fps = 24, t0 = 0): CameraSample[] {
  const n = Math.round(seconds * fps) + 1
  return Array.from({ length: n }, (_, i) => {
    const t = i / fps
    return { t: t0 + t, position: [t, 1.6, 0], quaternion: [0, 0, 0, 1], focal: 30 + (10 * t) / seconds, focus: 10 }
  })
}

describe('guide timing', () => {
  it('8n+1 frames covering the move, 9 to 121', () => {
    expect(guideFrameCount(0)).toBe(9)
    expect(guideFrameCount(0.2)).toBe(9)
    expect(guideFrameCount(3)).toBe(73)
    expect(guideFrameCount(3.01)).toBe(81) // a partial frame past 3 s still gets a frame
    expect(guideFrameCount(3 + 1e-9)).toBe(73)
    expect(guideFrameCount(5)).toBe(121)
    expect(guideFrameCount(12)).toBe(121)
    for (let d = 0; d <= 6; d += 0.13) {
      const n = guideFrameCount(d)
      expect((n - 1) % 8, `d=${d}`).toBe(0)
      expect(n).toBeLessThanOrEqual(121)
      if (d <= 5) expect((n - 1) / 24).toBeGreaterThanOrEqual(d - 1e-9) // the whole move is in
    }
  })

  it('resamples at 24 fps from the first sample: t = i/24, poses at those times, last pose held', () => {
    const { samples, held, cut } = resampleTake(take(1.1, 60, 2.5))
    expect(samples).toHaveLength(33) // 1.1 s -> 27 frames needed -> 33
    samples.forEach((s, i) => expect(s.t).toBeCloseTo(i / 24, 12))
    expect(samples[12].position[0]).toBeCloseTo(0.5, 9) // 12/24 s into a 1 m/s move
    expect(held).toBe(33 - 1 - 26)
    expect(samples[32].position[0]).toBeCloseTo(1.1, 9)
    expect(cut).toBe(0)
  })

  it('a 24 fps 3 s take maps 1:1; a 7 s take is cut to 5 s', () => {
    const t = take(3)
    const r = resampleTake(t)
    expect(r.samples).toHaveLength(73)
    expect(r.samples.map((s) => s.position[0])).toEqual(t.map((s) => s.position[0]))
    expect(r.held).toBe(0)
    const long = resampleTake(take(7))
    expect(long.samples).toHaveLength(121)
    expect(long.samples[120].position[0]).toBeCloseTo(5, 9)
    expect(long.cut).toBeCloseTo(2, 9)
  })
})

describe('guide lens', () => {
  it('per-sample focal -> the still convention vfov, centre-cropped to 768×448', () => {
    const viewAspect = 1.5
    const src = 1344 / 768 // wider than 768/448: the crop keeps vfov
    const f = guideCameras(resampleTake(take(3)).samples, viewAspect, src)
    expect(f[0].stillVfovDeg).toBeCloseTo(threeFovDeg(30, viewAspect), 12)
    expect(f[0].vfovDeg).toBeCloseTo(f[0].stillVfovDeg, 12)
    expect(f[72].focal).toBeCloseTo(40, 9)
    expect(f[72].stillVfovDeg).toBeLessThan(f[0].stillVfovDeg) // zoomed in
    expect(startPose(take(3), viewAspect).vfovDeg).toBeCloseTo(f[0].stillVfovDeg, 12)
  })

  it('a narrower source keeps its horizontal fov through the crop', () => {
    const v = cropVfov(50, 4 / 3, GUIDE_ASPECT)
    const h = (vf: number, a: number) => 2 * Math.atan(Math.tan((vf * Math.PI) / 360) * a)
    expect(h(v, GUIDE_ASPECT)).toBeCloseTo(h(50, 4 / 3), 12)
    expect(cropVfov(50, 2, GUIDE_ASPECT)).toBe(50)
  })
})

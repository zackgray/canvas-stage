import { describe, expect, it } from 'vitest'
import { fit8n1, HOLE, paintHoles, planWarp, type WarpTake } from './warpPlan'
import { slideTake } from './__fixtures__/slideTake'

const pack = { fps: 12, frames: 12 }
const ASPECT = 16 / 9

describe('the warp length: LTX’s 8n+1', () => {
  it('the longest 8n+1 (9 up to the limit, default 193) that fits', () => {
    expect([8, 9, 12, 16, 17, 96, 97, 98, 121, 200, 289].map((n) => fit8n1(n))).toEqual([0, 9, 9, 9, 17, 89, 97, 97, 121, 193, 193])
    expect([8, 9, 150, 200].map((n) => fit8n1(n, 121))).toEqual([0, 9, 121, 121])
  })

  it('the window is min(fit, max): a 200-frame performance warps 193 f, or 121 f when the server says so', () => {
    const long = { fps: 24, frames: 200 }
    expect(planWarp(slideTake(8), long, ASPECT).frames).toHaveLength(193)
    expect(planWarp(slideTake(8), long, ASPECT, 121).frames).toHaveLength(121)
    expect(planWarp(slideTake(4), { fps: 24, frames: 97 }, ASPECT, 193).frames).toHaveLength(97) // a short performance is not padded
  })
})

describe('planning the warp', () => {
  it('8n+1 frames from the pack, frame i at world time i/fps, with the take’s camera at that moment', () => {
    const p = planWarp(slideTake(1), pack, ASPECT)
    expect(p.sourceStart).toBe(0)
    expect(p.frames).toHaveLength(9) // 12 pack frames -> 9
    for (const f of p.frames) {
      expect(f.t).toBeCloseTo(f.i / 12, 12)
      expect(f.position[0]).toBeCloseTo(f.i / 12, 6)
    }
    expect(p.held).toBe(0)
    expect(planWarp(slideTake(4), { fps: 24, frames: 97 }, ASPECT).frames).toHaveLength(97)
  })

  it('a take shorter than the performance holds its last pose; the frames past it are counted', () => {
    const p = planWarp(slideTake(0.5), pack, ASPECT)
    expect(p.held).toBe(2) // frames 7, 8 (> 0.5 s)
    expect(p.frames[8].position[0]).toBeCloseTo(1, 6)
    expect(p.frames[6].position[0]).toBeCloseTo(1, 6)
  })

  it('a take that started mid-performance starts the warp (and the source window) at that pack frame', () => {
    const p = planWarp(slideTake(1, 0.25), pack, ASPECT)
    expect(p.sourceStart).toBe(3) // round(0.25 · 12)
    expect(p.frames).toHaveLength(9) // 12 - 3 frames left
    expect(p.frames[0].t).toBeCloseTo(0.25, 9) // = pack frame 3
    expect(p.frames[0].takeT).toBeCloseTo(0, 9)
    expect(p.frames[0].position[0]).toBeCloseTo(0, 6) // the take's first pose
    expect(p.frames[3].takeT).toBeCloseTo(0.25, 9)
    expect(p.frames[3].t).toBeCloseTo(0.5, 9)
  })

  it('refuses a warp shorter than 9 frames (a short pack, or a take that starts too late)', () => {
    expect(() => planWarp(slideTake(1), { fps: 12, frames: 8 }, ASPECT)).toThrow(/at least 9/)
    expect(() => planWarp(slideTake(1, 0.5), pack, ASPECT)).toThrow(/frame 6/)
  })

  it('lens: the operator view’s vfov at the view aspect, covered to the warp aspect', () => {
    const deg = (r: number) => (r * 180) / Math.PI
    const same = planWarp(slideTake(1), pack, ASPECT).frames[0] // a 16:9 view on a 16:9 warp: 35 mm as it was
    expect(same.vfovDeg).toBeCloseTo(deg(2 * Math.atan(18 / (16 / 9) / 35)), 6)
    const scope = planWarp({ ...slideTake(1), viewAspect: 2.35 }, pack, ASPECT).frames[0] // a wider view keeps its vfov (sides cropped)
    expect(scope.vfovDeg).toBeCloseTo(deg(2 * Math.atan(18 / 2.35 / 35)), 6)
    const square = planWarp({ ...slideTake(1), viewAspect: 1 }, pack, ASPECT).frames[0] // a narrower one keeps its hfov
    expect(square.vfovDeg).toBeCloseTo(same.vfovDeg, 6)
  })

  it('reads the take’s recorded car at the frame’s take time', () => {
    const take = { ...slideTake(1), track: { objects: [{ id: 'car', kind: 'car', label: 'a car', samples: [
      { t: 0, position: [0, 0, 0], heading: 0, speed: 0 }, { t: 1, position: [10, 0, 0], heading: 0, speed: 10 },
    ] }] } } as unknown as WarpTake
    const p = planWarp(take, pack, ASPECT)
    expect(p.poses[6]?.get('car')?.position[0]).toBeCloseTo(5, 6)
    expect(planWarp(slideTake(1), pack, ASPECT).poses[6]).toBeUndefined()
  })
})

describe('painting the holes', () => {
  const W = 4, H = 2
  const rgba = new Uint8Array(W * H * 4).map((_, k) => (k % 4 === 3 ? 255 : 10 + k))
  // pixel 5 is a real surface that happens to be exact magenta
  rgba.set([255, 0, 255, 255], 5 * 4)
  const depth = Float32Array.from([0, 3, 3, 0, 2, 2, NaN, 4])

  it('magenta exactly where the depth has no geometry, the colour elsewhere', () => {
    const { rgb, holeShare } = paintHoles(rgba, depth)
    for (let i = 0; i < W * H; i++) {
      const px = [...rgb.subarray(i * 3, i * 3 + 3)]
      const hole = !(depth[i] > 0)
      expect(px.join() === HOLE.join(), `pixel ${i}`).toBe(hole)
      if (!hole && i !== 5) expect(px).toEqual([...rgba.subarray(i * 4, i * 4 + 3)])
    }
    expect(holeShare).toBe(3 / 8)
  })

  it('a magenta surface is nudged off magenta, so magenta always means "no geometry"', () => {
    expect([...paintHoles(rgba, depth).rgb.subarray(15, 18)]).toEqual([254, 0, 254])
  })

  it('refuses colour and depth of different sizes', () => {
    expect(() => paintHoles(rgba, new Float32Array(3))).toThrow()
  })
})

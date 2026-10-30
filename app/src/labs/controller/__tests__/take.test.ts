import { Euler, Quaternion } from 'three'
import { describe, expect, it } from 'vitest'
import { lintTake } from '../take/lint'
import { maxTrackError, reduceKeyframes, toleranceFromSlider } from '../take/reduce'
import { TakeRecorder } from '../take/recorder'
import { alignHemispheres, smoothSamples } from '../take/smoothTake'
import { evaluateTrack, type CameraSample, type QuatT } from '../take/types'

const FPS = 24
const quat = (yaw: number, pitch = 0, roll = 0): QuatT => {
  const q = new Quaternion().setFromEuler(new Euler(pitch, yaw, roll, 'YXZ'))
  return [q.x, q.y, q.z, q.w]
}

function track(n: number, f: (t: number) => { pos: [number, number, number]; yaw: number; pitch?: number; focal?: number }) {
  return Array.from({ length: n }, (_, i): CameraSample => {
    const t = i / FPS
    const s = f(t)
    return { t, position: s.pos, quaternion: quat(s.yaw, s.pitch ?? 0), focal: s.focal ?? 35, focus: 10 }
  })
}

describe('recorder', () => {
  it('samples at a fixed 24 fps whatever the render rate, and stops at the cap', () => {
    const rec = new TakeRecorder()
    rec.capSeconds = 2
    rec.start({ position: [0, 0, 0], quaternion: [0, 0, 0, 1], focal: 35, focus: 10 }, { timelineStart: 0, rig: 'test', smoothingAmount: 0 })
    let t = 0
    let capped = false
    while (!capped) {
      const dt = 1 / 61 + (Math.sin(t * 50) + 1) * 0.004 // uneven frames
      t += dt
      capped = rec.tick(dt, { position: [t, 0, 0], quaternion: [0, 0, 0, 1], focal: 35, focus: 10 })
    }
    const take = rec.stop()!
    expect(take.samples.length).toBe(2 * FPS + 1)
    take.samples.forEach((s, i) => {
      expect(s.t).toBeCloseTo(i / FPS, 9)
      // Position was x = elapsed time, so interpolation should reproduce it exactly.
      expect(s.position[0]).toBeCloseTo(s.t, 6)
    })
  })
})

describe('keyframe reduction (RDP)', () => {
  it('reduces a constant-speed dolly to its two end keys', () => {
    const s = track(121, (t) => ({ pos: [0, 1.6, -t], yaw: 0 }))
    const keys = reduceKeyframes(s, toleranceFromSlider(1))
    expect(keys.length).toBe(2)
    expect(maxTrackError(s, keys).position).toBeLessThan(1e-9)
  })

  it('keeps the corner of a move that changes rate, and stays within tolerance', () => {
    const s = track(121, (t) => ({ pos: [0, 1.6, t < 2.5 ? -t : -2.5 - 3 * (t - 2.5)], yaw: Math.sin(t) * 0.3, focal: 35 + 5 * t }))
    const tol = toleranceFromSlider(1)
    const keys = reduceKeyframes(s, tol)
    expect(keys.length).toBeGreaterThan(2)
    expect(keys.length).toBeLessThan(30)
    const err = maxTrackError(s, keys)
    expect(err.position).toBeLessThanOrEqual(tol.position + 1e-9)
    expect(err.angleDeg).toBeLessThanOrEqual(tol.angleDeg + 1e-9)
    expect(err.focal).toBeLessThanOrEqual(tol.focal + 1e-9)
  })

  it('a looser tolerance gives fewer keys', () => {
    const s = track(121, (t) => ({ pos: [Math.sin(t * 2), 1.6, 0], yaw: Math.cos(t) * 0.5 }))
    expect(reduceKeyframes(s, toleranceFromSlider(4)).length).toBeLessThan(reduceKeyframes(s, toleranceFromSlider(0.5)).length)
  })
})

describe('take smoothing', () => {
  it('aligns quaternion hemispheres', () => {
    const q = quat(0.1)
    const out = alignHemispheres([q, [-q[0], -q[1], -q[2], -q[3]]])
    expect(out[1]).toEqual(q)
  })

  it('smooths handheld shake without drifting the move', () => {
    const shake = (t: number) => Math.sin(t * 61) * 0.02 + Math.sin(t * 37) * 0.015
    const s = track(121, (t) => ({ pos: [shake(t), 1.6 + shake(t + 1), -t], yaw: 0.2 * t + shake(t + 2) }))
    const sm = smoothSamples(s, FPS)
    const mid = 60
    expect(Math.abs(sm[mid].position[2] - -s[mid].t)).toBeLessThan(0.02)
    const jitter = (arr: CameraSample[]) => arr.slice(10, 110).reduce((acc, x) => acc + Math.abs(x.position[0]), 0)
    expect(jitter(sm)).toBeLessThan(jitter(s) * 0.5)
  })
})

describe('focus on takes (retired: nothing records it, an older take still carries it)', () => {
  const at = (t: number, focus?: number): CameraSample => ({ t, position: [t, 1.5, 0], quaternion: [0, 0, 0, 1], focal: 35, ...(focus !== undefined ? { focus } : {}) })
  it('a new take has no focus on any sample; it smooths, evaluates and plays without one', () => {
    const track = Array.from({ length: 12 }, (_, k) => at(k / 24))
    expect(smoothSamples(track, 24).every((s) => !('focus' in s))).toBe(true)
    expect('focus' in evaluateTrack(track, 0.1)).toBe(false)
  })
  it('an older take that carries a focus per sample still smooths and evaluates, keeping it', () => {
    const track = Array.from({ length: 12 }, (_, k) => at(k / 24, 5 + k))
    expect(smoothSamples(track, 24).every((s) => Number.isFinite(s.focus))).toBe(true)
    expect(evaluateTrack(track, 1 / 24 + 1 / 48).focus).toBeCloseTo(6.5, 6)
  })
})

describe('move linter', () => {
  it('passes a single slow pan', () => {
    const r = lintTake(track(121, (t) => ({ pos: [0, 1.6, 0], yaw: 0.15 * t })), FPS)
    expect(r.dominant).toEqual(['pan'])
    expect(r.warnings).toEqual([])
  })

  it('treats a partial orbit (truck + coupled pan) as one move', () => {
    const r = lintTake(
      track(121, (t) => {
        const a = 0.1 * t
        return { pos: [Math.sin(a) * 8, 1.6, Math.cos(a) * 8], yaw: a }
      }),
      FPS,
    )
    expect(r.dominant).toEqual(['orbit'])
    expect(r.warnings).toEqual([])
  })

  it('warns on two moves in one take', () => {
    const r = lintTake(track(121, (t) => ({ pos: [0, 1.6, -0.8 * t], yaw: 0, focal: 24 * Math.exp(0.25 * t) })), FPS)
    expect(r.dominant.sort()).toEqual(['dolly', 'zoom'])
    expect(r.warnings.some((w) => w.includes('More than one move'))).toBe(true)
  })

  it('warns on a whip pan', () => {
    const r = lintTake(track(49, (t) => ({ pos: [0, 1.6, 0], yaw: 2 * t })), FPS)
    expect(r.maxAngularSpeedDeg).toBeGreaterThan(100)
    expect(r.warnings.some((w) => w.includes('Rotation peaks'))).toBe(true)
  })

  it('warns when the move reverses direction', () => {
    const r = lintTake(track(121, (t) => ({ pos: [0, 1.6, 0], yaw: 0.4 * Math.sin(t * 1.2) })), FPS)
    expect(r.warnings.some((w) => w.includes('changes direction'))).toBe(true)
  })

  it('a locked-off take has no dominant move', () => {
    const r = lintTake(track(121, () => ({ pos: [0, 1.6, 0], yaw: 0 })), FPS)
    expect(r.dominant).toEqual([])
    expect(r.warnings).toEqual([])
  })
})

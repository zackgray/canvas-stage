// QA 2026-10-25: a user without a controller could only make a static take. Preset moves play from the framed camera and are
// recorded by the same take recorder a hand-flown take uses: the take is the chosen length (49 / 97 / 193 frames) and locks.
import { Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { lockRequest, takeFrames } from '../clay/plan'
import { STAGE_RIGS } from './link'
import { FOCAL_MAX_MM, FOCAL_MIN_MM } from '../../controller/math/lens'
import { ease, framePosition, leavesFrameAt, PRESET_SECONDS, PRESETS, presetPose, presetSamples, type PresetStart } from './presetMoves'
import { StageOperatorEngine } from './stageEngine'

const start: PresetStart = { position: [0, 1.6, 6], quaternion: [0, 0, 0, 1], focal: 35, focus: 6, target: [0, 1.6, 0] } // looking down -Z at the hero 6 m away
const v = (p: number[]) => new Vector3(p[0], p[1], p[2])
const right = new Vector3(1, 0, 0)
/** the target's direction in the camera's own frame (unchanged = still framed in the same place) */
const seen = (pose: { position: number[]; quaternion: number[] }) =>
  v(start.target!).sub(v(pose.position)).normalize().applyQuaternion(new Quaternion(...(pose.quaternion as [number, number, number, number])).invert())

describe('preset moves', () => {
  it('the lengths on offer are the shot lengths 2 / 4 / 6 / 8 s; 6 s is 145 frames and 8 s 193 (the render ceiling)', () => {
    expect([...PRESET_SECONDS]).toEqual([2, 4, 6, 8])
    expect(PRESET_SECONDS.map((s) => presetSamples('hold', start, s).length)).toEqual([49, 97, 145, 193])
  })
  it('ease in and out: starts and ends at rest', () => {
    expect([ease(0), ease(0.5), ease(1)]).toEqual([0, 0.5, 1])
    for (const p of PRESETS) expect(presetPose(p.id, start, 0).position).toEqual(start.position)
  })
  it('push in moves toward the hero and pulls focus with it; pull out backs away', () => {
    const push = presetPose('push', start, 1), pull = presetPose('pull', start, 1)
    expect(push.position[2]).toBeLessThan(6); expect(push.focus).toBeLessThan(6)
    expect(pull.position[2]).toBeGreaterThan(6); expect(push.quaternion).toEqual(start.quaternion)
  })
  it('pan turns in place; orbit circles the hero and keeps him framed where he was', () => {
    const pl = presetPose('pan-left', start, 1)
    expect(pl.position).toEqual(start.position)
    expect(new Vector3(0, 0, -1).applyQuaternion(new Quaternion(...pl.quaternion)).x).toBeLessThan(-0.3) // looks left
    for (const [id, side] of [['orbit-left', -1], ['orbit-right', 1]] as const) {
      const o = presetPose(id, start, 1)
      expect(Math.sign(v(o.position).sub(v(start.position)).dot(right))).toBe(side)
      expect(v(o.position).distanceTo(v(start.target!))).toBeCloseTo(6, 6)
      expect(seen(o).distanceTo(seen({ position: start.position, quaternion: start.quaternion }))).toBeLessThan(1e-6)
    }
  })
  it('crane with the hero off centre: it rises straight up and only tilts (no roll, no yaw), keeping the hero where it was framed', () => {
    const off: PresetStart = { ...start, quaternion: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.3).toArray() as [number, number, number, number] }
    const yawOf = (q: Quaternion) => new Vector3(0, 0, -1).applyQuaternion(q)
    const q0 = new Quaternion(...off.quaternion)
    for (const u of [0.25, 0.5, 0.75, 1]) {
      const c = presetPose('crane', off, u), q = new Quaternion(...c.quaternion)
      expect(c.position[0]).toBeCloseTo(off.position[0], 9); expect(c.position[2]).toBeCloseTo(off.position[2], 9) // straight up
      expect(new Vector3(1, 0, 0).applyQuaternion(q).y).toBeCloseTo(0, 9) // no roll: the camera's right stays level
      const f0 = yawOf(q0), f = yawOf(q)
      expect(Math.atan2(f.x, -f.z)).toBeCloseTo(Math.atan2(f0.x, -f0.z), 9) // no yaw creep
      expect(f.y).toBeLessThan(f0.y) // tilted down
    }
  })

  it('crane rises and tilts down onto the hero; static hold never moves', () => {
    const c = presetPose('crane', start, 1)
    expect(c.position[1]).toBeCloseTo(3.1, 6)
    expect(seen(c).distanceTo(new Vector3(0, 0, -1))).toBeLessThan(1e-6) // the hero is still dead centre
    expect(presetSamples('hold', start, 2).every((s) => s.position.join() === start.position.join())).toBe(true)
  })
  it('every preset x 2/4/6/8 s keeps the lens inside the operator zoom (12-85 mm), even from a start just outside it', () => {
    for (const focal of [FOCAL_MIN_MM - 0.3, FOCAL_MIN_MM, 35, 85, 86.2]) for (const p of PRESETS) for (const secs of PRESET_SECONDS) {
      for (const s of presetSamples(p.id, { ...start, focal }, secs)) expect(s.focal).toBeGreaterThanOrEqual(FOCAL_MIN_MM), expect(s.focal).toBeLessThanOrEqual(FOCAL_MAX_MM)
    }
  })
})

/** a stage engine with the camera framed at `start` (no world bound: the take still records, without a world track) */
function rig() {
  const e = new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false, orbitTarget: () => v(start.target!) })
  e.takeOver(v(start.position), new Quaternion(...start.quaternion), start.focal)
  e.focus = start.focus
  return e
}
const run = (e: StageOperatorEngine, dt = 1 / 60, max = 2000) => { for (let i = 0; i < max && e.move; i++) e.tick(dt, 16 / 9) }

describe('a preset recorded as a take', () => {
  for (const [secs, frames] of [[2, 49], [4, 97], [8, 193]] as const) {
    it(`${secs} s: one take of ${frames} frames, locked at ${frames}, the move from start to end; the camera goes home`, () => {
      const e = rig()
      expect(e.startPreset('orbit-left', secs, true)).toBe(true)
      expect(e.deck.recording).toBe(true)
      run(e)
      expect(e.move).toBeNull(); expect(e.deck.recording).toBe(false)
      const take = e.deck.take!
      expect(e.deck.takeCount).toBe(1)
      expect(take.raw.samples).toHaveLength(frames)
      expect(take.raw.samples.at(-1)!.t).toBeCloseTo(secs, 9)
      expect(takeFrames(take.smoothed)).toBe(frames)
      expect(lockRequest(take, null, 'loc-a', 16 / 9).frames).toBe(frames)
      const end = presetPose('orbit-left', start, 1)
      take.raw.samples.at(-1)!.position.forEach((x, i) => expect(x).toBeCloseTo(end.position[i], 6))
      expect(take.raw.rig).toBe('Orbit left')
      expect(e.out.position.toArray()).toEqual(start.position) // back where it was framed: Record again films the same move
    })
  }
  it('Preview plays the move with no take; a jittery frame rate still gives the exact length', () => {
    const e = rig()
    e.startPreset('push', 2, false)
    run(e)
    expect(e.deck.takeCount).toBe(0)
    e.startPreset('push', 2, true)
    let i = 0
    while (e.move && i++ < 2000) e.tick(i % 3 ? 1 / 75 : 1 / 41, 16 / 9)
    expect(e.deck.take!.raw.samples).toHaveLength(49)
  })
  it('R (or Stop) ends a preset early and keeps what it filmed; no second move starts on top of one', () => {
    const e = rig()
    e.startPreset('crane', 4, true)
    expect(e.startPreset('push', 2, true)).toBe(false)
    for (let i = 0; i < 60; i++) e.tick(1 / 60, 16 / 9)
    e.toggleRecording()
    expect(e.move).toBeNull()
    expect(e.deck.take!.raw.samples.length).toBeGreaterThan(20)
    expect(e.deck.take!.raw.samples.length).toBeLessThan(97)
  })
})

// Hold on the subject: the performer walks across the shot (2.4 m each way, the performance's own positions over take time), and a
// move that holds on her (any of them: push in, crane and static too, owner 2026-10-28) keeps her chest in the centre third of the frame on every sample.
const walker = (t: number): [number, number, number] => [-1.2 + 0.6 * t, 1.2, 0] // 2.4 m over a 4 s take, chest height
const walking: PresetStart = { ...start, target: [0, 1.2, 0], subject: walker }
const centreThird = (id: Parameters<typeof presetSamples>[0], hold: boolean, secs = 4) =>
  presetSamples(id, walking, secs, 24, hold).map((s) => framePosition(s, walker(s.t), 16 / 9))

describe('Hold on: ticking it centres her and the camera stays there', () => {
  const held = () => {
    const e = rig()
    ;(e as unknown as { world: unknown }).world = { performance: { chestAt: () => new Vector3(1.5, 1.2, 0) }, clock: e.timeline, sources: () => [], trackHash: '' }
    return e
  }
  const centred = (e: StageOperatorEngine) => framePosition({ position: e.out.position.toArray(), quaternion: e.out.quaternion.toArray() as [number, number, number, number], focal: e.out.focal, focus: e.focus }, [1.5, 1.2, 0], 16 / 9)!
  it('aims at her chest on the tick, from where the camera stands', () => {
    const e = held()
    expect(Math.abs(centred(e).x)).toBeGreaterThan(0.1) // framed off centre before
    expect(e.aimAtSubject()).toBe(true)
    expect(e.out.position.toArray()).toEqual(start.position)
    expect(Math.abs(centred(e).x)).toBeLessThan(1e-6)
    expect(Math.abs(centred(e).y)).toBeLessThan(1e-6)
  })
  it('is still aimed after a Preview: the move ends back on its frame 0, held on her', () => {
    for (const id of ['push', 'pull', 'crane', 'hold'] as const) {
      const e = held()
      e.aimAtSubject()
      e.startPreset(id, 2, false, true)
      run(e)
      expect(Math.abs(centred(e).x)).toBeLessThan(1e-6)
      expect(Math.abs(centred(e).y)).toBeLessThan(1e-6)
    }
  })
  it('nobody to hold on: nothing moves', () => {
    const e = rig()
    expect(e.aimAtSubject()).toBe(false)
    expect(e.out.position.toArray()).toEqual(start.position)
  })
})

describe('hold on the subject', () => {
  for (const { id } of PRESETS) for (const secs of PRESET_SECONDS) {
    it(`${id}, ${secs} s: her chest stays in the centre third on every sample`, () => {
      const pos = centreThird(id, true, secs)
      expect(pos.length).toBe(secs * 24 + 1)
      for (const f of pos) { expect(f).not.toBeNull(); expect(Math.abs(f!.x)).toBeLessThan(1 / 3); expect(Math.abs(f!.y)).toBeLessThan(1 / 3) }
    })
  }
  it('without the hold the same walk leaves the centre third (so the hold is what keeps her framed)', () => {
    expect(centreThird('pull', false).some((f) => !f || Math.abs(f.x) > 1 / 3)).toBe(true)
  })
  it('the hold is a no-op without a performer; a held crane still rises and a held push-in still travels (the hold turns the camera, the move carries it)', () => {
    for (const id of ['push', 'crane'] as const) expect(presetSamples(id, walking, 2, 24, true).map((s) => s.position)).toEqual(presetSamples(id, walking, 2, 24, false).map((s) => s.position))
    expect(presetSamples('pull', start, 2, 24, true)).toEqual(presetSamples('pull', start, 2, 24, false))
  })
  it('holding pulls focus to the chest distance', () => {
    const last = presetSamples('pull', walking, 4, 24, true).at(-1)!
    const c = walker(last.t)
    expect(last.focus).toBeCloseTo(Math.hypot(last.position[0] - c[0], last.position[1] - c[1], last.position[2] - c[2]), 6)
  })
  it('a pan that turns her out of frame says when; held, or with her inside the arc, it says nothing', () => {
    const still: PresetStart = { ...start, subject: () => [-1.5, 1.2, 0] }
    expect(leavesFrameAt('pan-right', still, 4, false)).not.toBeNull() // she is left of centre and the camera turns right: out of the left edge
    expect(leavesFrameAt('pan-right', still, 4, true)).toBeNull()
    expect(leavesFrameAt('pan-left', still, 4, false)).toBeNull() // turning toward her: she drifts right of centre but stays in
    expect(leavesFrameAt('pan-left', { ...start, subject: () => [0, 1.2, 0] }, 4, false)).not.toBeNull() // dead centre: a 30 degree pan is wider than half the 35 mm frame
    expect(leavesFrameAt('pan-left', start, 4, false)).toBeNull() // no performer: nothing to say
  })
  it('the engine records the held move: the take it films keeps her in the centre third', () => {
    const e = rig()
    ;(e as unknown as { world: unknown }).world = { performance: { chestAt: (t: number) => v(walker(t)) }, clock: e.timeline, sources: () => [], trackHash: '' }
    expect(e.hasSubject).toBe(true)
    e.startPreset('pull', 4, true, true)
    run(e)
    for (const smp of e.deck.take!.raw.samples) {
      const f = framePosition(smp, walker(smp.t), 16 / 9)!
      expect(Math.abs(f.x)).toBeLessThan(1 / 3)
    }
  })
})

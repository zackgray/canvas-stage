// Track D playback (docs/plan-kimodo-live.md 8 "Playback"): a kept user move merges into the clip lookup under its gen:<id>, compiles
// like the lift (pinned in, hold, out; an auto-turn faces the named piece first), its object rides the wrist midpoint and no second
// hive is built for a named set piece; a move whose clip is missing plays as Stop for its seconds, with a warning naming it.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PerformancePlan } from '../contract.ts'
import { compile } from '../motion/compile.ts'
import { loadLibrary, type Library } from '../motion/library.ts'
import { holdsProp, poseWordsAt } from '../motion/phase.ts'
import { fk, fkBuffers } from '../motion/skeleton.ts'
import { evaluator } from '../motion/timeline.ts'
import { refOf } from '../motion/userClips.ts'
import { performerFrom } from '../performer.ts'
import { GRIP_DROP } from '../props/frameMath.ts'

const PUBLIC = fileURLToPath(new URL('../../../public', import.meta.url))
/** the shipped lift's bvh stands in for a kept move's clip file (same skeleton and format, plan 1.5) */
const LIFT_BVH = readFileSync(PUBLIC + '/mocap/kimodo/lift_frame.bvh', 'utf8')

/** a ClipDef-shaped clip.json (plan 1.5) for the folder, served through the read fn below */
const clipJson = (folder: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    url: `/lab-assets/motions/${folder}/clip.bvh`,
    source: { generated: 'kimodo:test/1' },
    note: 'takes a frame out of the hive and holds it up to the light',
    root: 'pinned',
    in: 1.0,
    out: 7.95,
    hold: [4.5, 7.95],
    prop: { kind: 'frame', grab: 2.5 },
    phases: [
      { from: 0, words: 'standing at the hive, both hands empty' },
      { from: 1.3, words: 'bending over the hive, reaching into it with both hands, the hands still empty' },
      { from: 2.5, words: 'lifting a frame out of the hive with both hands' },
      { from: 4.3, words: 'holding a frame up at head height in both hands, looking at it' },
    ],
    ...extra,
  })

const REFS = [
  refOf({ id: 'gen:take-frame', folder: 'take-frame', note: 'takes a frame out of the hive and holds it up to the light' })!,
  refOf({ id: 'gen:set-down', folder: 'set-down', note: 'lifts the crate and sets it down' })!,
  refOf({ id: 'gen:gone', folder: 'gone', note: 'lifts the crate onto the bench' })!,
]

const read = async (u: string): Promise<string> => {
  if (u === '/lab-assets/motions/take-frame/clip.json') return clipJson('take-frame')
  if (u === '/lab-assets/motions/set-down/clip.json') return clipJson('set-down', { in: 0, hold: [2.0, 2.9], prop: { grab: 0.6, release: 2.9 } })
  if (u.startsWith('/lab-assets/motions/gone/')) throw new Error(`missing: ${u}`) // the folder did not keep
  if (u.startsWith('/lab-assets/motions/')) return LIFT_BVH
  return readFileSync(PUBLIC + u, 'utf8')
}

let lib: Library
beforeAll(async () => { lib = await loadLibrary(read, REFS) }, 60_000)

const MOVE: PerformancePlan = { path: [[0, 0], [0, -4]], actions: [{ kind: 'move', at: 4, seconds: 2, motion: 'gen:take-frame' }] }
const MOVE_ON: PerformancePlan = { path: [[0, 0], [0, -4], [0, -7]], actions: [{ kind: 'move', at: 4, seconds: 1.5, motion: 'gen:take-frame' }] }
const MOVE_AT_MARK: PerformancePlan = { path: [[0, 0], [0, -0.1]], actions: [{ kind: 'move', at: 0, seconds: 3, motion: 'gen:take-frame' }] }

/** the hero's wrists in the figure via the timeline's own pose */
function wrists(perf: ReturnType<typeof performerFrom>, t: number) {
  const { pos, rot } = fkBuffers(lib.canon), p = evaluator(perf.timeline).pose(t)
  fk(lib.canon, p, pos, rot)
  return [pos[lib.canon.index.LeftHand].clone(), pos[lib.canon.index.RightHand].clone()] as const
}
const tagged = (perf: ReturnType<typeof performerFrom>, tag: string) => {
  let hit: THREE.Object3D | null = null
  perf.object.traverse((o) => { if (!hit && o.userData.entity === tag) hit = o })
  return hit as THREE.Object3D | null
}

describe('a kept user move in the library', () => {
  it('loads into the lookup under its gen id, pinned with its window, hold, prop, phases and generated source', () => {
    const c = lib.clips['gen:take-frame']!
    expect(c).toBeTruthy()
    expect(c.id).toBe('gen:take-frame')
    expect(c.def.root).toBe('pinned')
    expect(c.def.source).toEqual({ generated: 'kimodo:test/1' })
    expect(c.def.hold).toEqual([4.5, 7.95])
    expect(c.def.prop).toEqual({ kind: 'frame', grab: 2.5 })
    expect(c.def.phases![0].words).toMatch(/both hands empty/)
    expect(c.t1).toBeGreaterThan(c.def.out - 0.02) // the window is inside the file
    expect(lib.notes['gen:take-frame']).toMatch(/takes a frame/)
    expect(lib.clips['gen:gone']).toBeUndefined() // its folder did not load: no lookup entry
    expect(lib.clips.lift.id).toBe('lift') // the builtin lookup is untouched
  })
})

describe('a move as a path action', () => {
  it('compiles like the lift: in and hold at the path end; in, hold, out when the path goes on', () => {
    expect(compile(MOVE, lib).segs.map((g) => g.kind)).toEqual(['travel', 'stop', 'move', 'move-hold'])
    const hold = compile(MOVE, lib).segs.find((g) => g.kind === 'move-hold')!
    expect(hold.t1 - hold.t0).toBeCloseTo(2, 6) // `seconds` is the hold, as the lift's is
    // a clip with an outro tail (its hold ends before the file does) plays it, then the walk goes on — as the lift plays lift-down
    const setDown: PerformancePlan = { path: [[0, 0], [0, -4], [0, -7]], actions: [{ kind: 'move', at: 4, seconds: 1, motion: 'gen:set-down' }] }
    const on = compile(setDown, lib).segs.map((g) => g.kind)
    expect(on.slice(0, 5)).toEqual(['travel', 'stop', 'move', 'move-hold', 'move-out'])
    expect(on.at(-1)).toBe('travel')
    // a clip whose hold reaches the file's end has no outro: she carries the object on with her
    expect(compile(MOVE_ON, lib).segs.map((g) => g.kind)).toEqual(['travel', 'stop', 'move', 'move-hold', 'start', 'travel'])
  })
  it('turns first toward the set piece it names when that is more than ~15° off the facing at the point (plan 2.5)', () => {
    const act = { kind: 'move', at: 4, seconds: 2, motion: 'gen:take-frame', toward: [4, -4] } as const
    const piece: PerformancePlan = { path: [[0, 0], [0, -4]], actions: [{ ...act, toward: [4, -4] }] }
    const kinds = compile(piece, lib).segs.map((g) => g.kind)
    expect(kinds.indexOf('turn')).toBeGreaterThanOrEqual(0)
    expect(kinds.indexOf('turn')).toBeLessThan(kinds.indexOf('move')) // the turn plays before the move
    const ahead: PerformancePlan = { path: [[0, 0], [0, -4]], actions: [{ ...act, toward: [0, -5] }] } // straight on, the way she arrives facing
    expect(compile(ahead, lib).segs.map((g) => g.kind)).toEqual(['travel', 'stop', 'move', 'move-hold'])
    const off10: PerformancePlan = { path: [[0, 0], [0, -4]], actions: [{ ...act, toward: [Math.sin(Math.PI - Math.PI / 18), -4 + Math.cos(Math.PI - Math.PI / 18)] }] } // 10° off: inside the threshold
    expect(compile(off10, lib).segs.some((g) => g.kind === 'turn')).toBe(false)
  })
  it('a move whose clip is missing plays as Stop for its seconds, with a warning naming the move', () => {
    const tl = compile({ path: [[0, 0], [0, -4]], actions: [{ kind: 'move', at: 4, seconds: 2.5, motion: 'gen:gone' }] }, lib)
    const still = tl.segs.find((g) => g.kind === 'stop' && g.decay === Infinity)! // the walking 'stop' clip moves (decay 1)
    expect(still).toBeTruthy()
    expect(still.t1 - still.t0).toBeCloseTo(2.5, 6)
    expect(tl.warnings.join(' ')).toMatch(/gen:gone/)
    expect(tl.warnings.join(' ')).toMatch(/lifts the crate/) // the user's own words
  })
})

describe('a move\'s held object', () => {
  it('the frame rides the wrist midpoint between grab and release, rests at the grab point before and is never stretched', () => {
    const perf = performerFrom(MOVE_ON, () => 0, lib), tl = perf.timeline
    const held = tagged(perf, 'prop:frame')!
    expect(held).toBeTruthy()
    const move = tl.segs.find((g) => g.kind === 'move')!, hold = tl.segs.find((g) => g.kind === 'move-hold')!
    perf.poseAt(move.t0 + 0.2); const rest = held.position.clone()
    perf.poseAt(move.t0 + 0.8); expect(held.position.distanceTo(rest)).toBeLessThan(1e-9) // resting at the grab point while she bends
    const grab = move.t0 + (2.5 - move.tau!(move.t0)) / ((move.tau!(move.t1) - move.tau!(move.t0)) / (move.t1 - move.t0))
    expect(holdsProp(move, grab - 0.05)).toBe(false); expect(holdsProp(move, grab + 0.05)).toBe(true)
    const t = (hold.t0 + hold.t1) / 2, [l, r] = wrists(perf, t)
    perf.poseAt(t)
    const mid = l.clone().add(r).multiplyScalar(0.5)
    expect(held.position.x).toBeCloseTo(mid.x, 6); expect(held.position.z).toBeCloseTo(mid.z, 6)
    expect(held.position.y).toBeCloseTo(mid.y - GRIP_DROP, 6)
    const bar = new THREE.Vector3(1, 0, 0).applyQuaternion(held.quaternion), wv = r.clone().sub(l).normalize()
    expect(bar.dot(wv)).toBeCloseTo(1, 6)
    expect(held.scale.toArray()).toEqual([1, 1, 1])
  })
  it('a prop that is not the frame rides a plain clay block sized to the grip, and it rests where it was let go', () => {
    const perf = performerFrom({ path: [[0, 0], [0, -4], [0, -7]], actions: [{ kind: 'move', at: 4, seconds: 1, motion: 'gen:set-down' }] }, () => 0, lib)
    const block = tagged(perf, 'prop:frame')!
    expect(block).toBeTruthy()
    expect(block.name).toBe('held-block')
    const size = new THREE.Box3().setFromObject(block).getSize(new THREE.Vector3())
    expect(size.x).toBeGreaterThanOrEqual(0.3); expect(size.x).toBeLessThanOrEqual(0.55) // the grip at grab, clamped (plan 2.3)
    const tl = perf.timeline, out = tl.segs.find((g) => g.kind === 'move-out')!
    perf.poseAt(out.t1 - 0.05); const after = block.position.clone()
    perf.poseAt(out.t1 + 2); expect(block.position.distanceTo(after)).toBeLessThan(1e-9) // let go: it stays where it was put
  })
  it('a move naming a set piece builds no hive of its own, named or not: the set piece is the one (no second hive)', () => {
    const setHive = { kind: 'crates', args: [7, 1], at: [0.4, -4.4] as [number, number], label: 'a white hive', pieceTag: 'prop:hive' }
    const plan: PerformancePlan = { path: [[0, 0], [0, -4]], actions: [{ kind: 'move', at: 4, seconds: 2, motion: 'gen:take-frame', toward: [0.4, -4.4] }] }
    const perf = performerFrom(plan, () => 0, lib, [setHive])
    expect(tagged(perf, 'prop:hive')).toBeNull()
    expect(tagged(perf, 'prop:frame')).toBeTruthy()
    expect(tagged(performerFrom(MOVE, () => 0, lib), 'prop:hive')).toBeNull()
  })
})

describe('the still-action words of a made move', () => {
  it('the clip.json phases feed the phase reader unchanged: frame 0 never mentions the object in hand', () => {
    const tl = compile(MOVE_AT_MARK, lib), hold = tl.segs.find((g) => g.kind === 'move-hold')!
    expect(poseWordsAt(tl, 0)).toMatch(/standing at the hive, both hands empty/)
    expect(poseWordsAt(tl, hold.t0 - 0.8)).toMatch(/lifting a frame/)
    expect(poseWordsAt(tl, (hold.t0 + hold.t1) / 2)).toMatch(/holding a frame up at head height/)
  })
})

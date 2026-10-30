// The lift (2026-10-25): the generated Kimodo clip registered in the motion library, placed as a path action (stand, bend, take the
// frame at the hive's rim, raise it to head height, hold; lowered back and stood up when more follows), and its props: a hive at the
// pick and a frame that rests in it, rides the wrist midpoint while held and rests where it was let go.
import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { CLIPS } from '../clips.ts'
import { poseDistance } from '../motion/clip.ts'
import { compile } from '../motion/compile.ts'
import type { Library } from '../motion/library.ts'
import { holdsProp, poseWordsAt } from '../motion/phase.ts'
import { fk, fkBuffers, makePose } from '../motion/skeleton.ts'
import { evaluator } from '../motion/timeline.ts'
import { entityOf, performerFrom } from '../performer.ts'
import { GRIP_DROP } from '../props/frameMath.ts'
import { diskLibrary, LIFT_END, LIFT_HERE, LIFT_ON } from './motion.fixture.ts'

let lib: Library
beforeAll(async () => { lib = await diskLibrary() }, 60_000)

/** the hero's wrists in the figure (the mannequin's hand pieces sit on the wrist joints) via the timeline's own pose */
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

describe('the lift clip in the library', () => {
  it('registers as a generated clip with its ending, both on the canonical skeleton and in their windows', () => {
    for (const id of ['lift', 'liftDown'] as const) {
      const c = lib.clips[id]
      expect(CLIPS[id].source).toMatchObject({ generated: expect.stringMatching(/^kimodo:/) })
      expect(c.t1).toBeGreaterThan(c.def.out - 0.02) // the window is inside the file
      expect(c.def.root).toBe('pinned')
    }
    expect(lib.clips.lift.def.hold).toEqual([4.5, 7.95])
    expect(lib.clips.lift.def.prop).toEqual({ kind: 'frame', grab: 2.5 })
  })
  it('the ending starts on the lift\'s last pose (generated to match), so the hold blends into it', () => {
    const a = lib.clips.lift.once(lib.clips.lift.t1, makePose(lib.canon.names.length)), b = lib.clips.liftDown.once(0, makePose(lib.canon.names.length))
    expect(poseDistance(a, b)).toBeLessThan(0.05)
    const idle = lib.clips.idle.loop(0, makePose(lib.canon.names.length)), start = lib.clips.lift.once(lib.clips.lift.def.in, makePose(lib.canon.names.length))
    expect(Math.abs(start.root.y - idle.root.y)).toBeLessThan(0.08) // stands at its in point, as the idle does: a plain blend from standing
  })
})

describe('the lift as a path action', () => {
  it('walk, stop, lift, hold at the path end; lowered back down and on when the path goes on', () => {
    expect(compile(LIFT_END, lib).segs.map((g) => g.kind)).toEqual(['travel', 'stop', 'lift', 'lift-hold'])
    const on = compile(LIFT_ON, lib).segs.map((g) => g.kind)
    expect(on.slice(0, 5)).toEqual(['travel', 'stop', 'lift', 'lift-hold', 'lift-down'])
    expect(on.at(-1)).toBe('travel')
  })
  it('the frame is up at head height in the hold and taken at the rim (hands about 0.7 m up)', () => {
    const perf = performerFrom(LIFT_END, () => 0, lib), tl = perf.timeline, hold = tl.segs[3], lift = tl.segs[2]
    const [l, r] = wrists(perf, (hold.t0 + hold.t1) / 2)
    expect((l.y + r.y) / 2).toBeGreaterThan(1.3)
    const grab = lift.t0 + (2.5 - lift.tau!(lift.t0)) / ((lift.tau!(lift.t1) - lift.tau!(lift.t0)) / (lift.t1 - lift.t0))
    const [gl, gr] = wrists(perf, grab)
    expect((gl.y + gr.y) / 2).toBeGreaterThan(0.6); expect((gl.y + gr.y) / 2).toBeLessThan(0.8)
    expect(holdsProp(lift, grab - 0.05)).toBe(false); expect(holdsProp(lift, grab + 0.05)).toBe(true)
  })
})

describe('the lift\'s props', () => {
  it('a hive at the pick (rim just above the wrists, in front of the hips) and a frame tagged for the ID pass', () => {
    const perf = performerFrom(LIFT_HERE, () => 0, lib)
    const hive = tagged(perf, 'prop:hive')!, frame = tagged(perf, 'prop:frame')!
    expect(hive).toBeTruthy(); expect(frame).toBeTruthy()
    expect(entityOf(frame.children[0] as THREE.Object3D)).toBe('prop:frame')
    const box = new THREE.Box3().setFromObject(hive)
    expect(box.max.y).toBeGreaterThan(0.62); expect(box.max.y).toBeLessThan(0.78) // the rim, as the spike measured (~0.70 m)
    const hips = evaluator(perf.timeline).pose(0).root, f = perf.headingAt(0), ahead = (hive.position.x - hips.x) * f.x + (hive.position.z - hips.z) * f.z
    expect(ahead).toBeGreaterThan(0.2); expect(ahead).toBeLessThan(0.5) // ~0.36 m in front of the hips, the way she faces
    let hives = 0; perf.object.traverse((o) => { if (o.userData.entity === 'prop:hive') hives++ })
    expect(hives).toBe(1) // one lift, one hive (its hold goes on with the same frame)
    expect(performerFrom({ path: [[0, 0], [0, -4]] }, () => 0, lib).object.getObjectByName('lift-props')).toBeUndefined()
  })
  it('a hive of the set at the pick is the lift\'s hive: none is built, the frame still rests and rides; one far off does not count', () => {
    const own = tagged(performerFrom(LIFT_HERE, () => 0, lib), 'prop:hive')!
    const setHive = { kind: 'crates', args: [7, 1], at: [own.position.x, own.position.z] as [number, number], label: 'a white hive', pieceTag: 'prop:hive' }
    const perf = performerFrom(LIFT_HERE, () => 0, lib, [setHive])
    expect(tagged(perf, 'prop:hive')).toBeNull()
    expect(tagged(perf, 'prop:frame')).toBeTruthy()
    expect(tagged(performerFrom(LIFT_HERE, () => 0, lib, [{ ...setHive, at: [9, 9] }]), 'prop:hive')).toBeTruthy()
    expect(tagged(performerFrom(LIFT_HERE, () => 0, lib, [{ ...setHive, label: 'a crate', pieceTag: undefined }]), 'prop:hive')).toBeTruthy()
  })
  it('the frame rests in the hive before the grab, rides the wrist midpoint while held, and stays put after it is let go', () => {
    const perf = performerFrom(LIFT_ON, () => 0, lib), tl = perf.timeline, frame = tagged(perf, 'prop:frame')!
    const lift = tl.segs.find((g) => g.kind === 'lift')!, down = tl.segs.find((g) => g.kind === 'lift-down')!, hold = tl.segs.find((g) => g.kind === 'lift-hold')!
    perf.poseAt(lift.t0 + 0.2); const rest = frame.position.clone()
    perf.poseAt(lift.t0 + 0.8); expect(frame.position.distanceTo(rest)).toBeLessThan(1e-9) // still in the hive while she bends
    const t = (hold.t0 + hold.t1) / 2, [l, r] = wrists(perf, t)
    perf.poseAt(t)
    const mid = l.clone().add(r).multiplyScalar(0.5)
    expect(frame.position.x).toBeCloseTo(mid.x, 6); expect(frame.position.z).toBeCloseTo(mid.z, 6)
    expect(frame.position.y).toBeCloseTo(mid.y - GRIP_DROP, 6)
    const bar = new THREE.Vector3(1, 0, 0).applyQuaternion(frame.quaternion), wv = r.clone().sub(l).normalize()
    expect(bar.dot(wv)).toBeCloseTo(1, 6) // the top bar along the wrist vector
    expect(frame.scale.toArray()).toEqual([1, 1, 1]) // never stretched to the hands' spacing
    perf.poseAt(down.t1 - 0.1); const after = frame.position.clone()
    perf.poseAt(down.t1 + 2); expect(frame.position.distanceTo(after)).toBeLessThan(1e-9) // let go: it stays where it was put
    expect(after.y).toBeLessThan(0.8) // back down in the hive
  })
})

describe('the pose words by clip phase', () => {
  it('frame 0 of a lift stands with empty hands; the lift and hold carry the frame; the lowering ends with empty hands', () => {
    const tl = compile(LIFT_HERE, lib), lift = tl.segs[0], hold = tl.segs[1]
    // (stage-only) the phase words name no test piece (clips.ts): "the piece in front of them", "something"
    expect(poseWordsAt(tl, 0)).toMatch(/standing at the piece in front of them, both hands empty/)
    expect(poseWordsAt(tl, lift.t0 + 0.8)).toMatch(/bending over the piece in front of them.*hands still empty/)
    expect(poseWordsAt(tl, lift.t0 + 2.0)).toMatch(/^lifting something out of the piece/)
    expect(poseWordsAt(tl, (hold.t0 + hold.t1) / 2)).toMatch(/^holding something up at head height/)
    const on = compile(LIFT_ON, lib), down = on.segs.find((g) => g.kind === 'lift-down')!
    expect(poseWordsAt(on, down.t0 + 1)).toMatch(/^lowering something back/)
    expect(poseWordsAt(on, down.t1 - 0.1)).toMatch(/both hands empty/)
    expect(poseWordsAt(on, 0.5)).toBe('') // walking there: the segment carries no pose words of its own
  })
})

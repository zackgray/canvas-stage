// Recipe wave C3a: an extra can stand (idle clip, no walking) facing a point, and look; the pose stays pure in t.
import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ExtraPlan, PerformancePlan } from '../contract.ts'
import { compile } from '../motion/compile.ts'
import { extraMotionPlan } from '../motion/extraPlan.ts'
import type { Library } from '../motion/library.ts'
import { evaluator } from '../motion/timeline.ts'
import { performerFrom } from '../performer.ts'
import { STRAIGHT, diskLibrary } from './motion.fixture.ts'

let lib: Library
beforeAll(async () => { lib = await diskLibrary() }, 60_000)

const STAND: ExtraPlan = { path: [[4, -6]], gait: 'walk', delay: 5, costume: 'modern', variant: 1, stand: true, face: [0, -6] }
const ev = (e: ExtraPlan) => evaluator(compile(extraMotionPlan(e, 1, [0, 0]), lib))
const centre = (o: THREE.Object3D) => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()) }

describe('a standing extra', () => {
  it('compiles from a single-point path and holds the spot for the whole take', () => {
    const e = ev(STAND)
    for (const t of [0, 3, 20, 100]) { const a = e.anchor(t); expect(a.x).toBeCloseTo(4, 3); expect(a.z).toBeCloseTo(-6, 3) }
  })

  it('faces the face point, or the hero start when none is given', () => {
    expect(ev(STAND).heading(2)).toBeCloseTo(-Math.PI / 2, 2) // toward -x
    const { face: _f, ...noFace } = STAND
    expect(ev(noFace).heading(2)).toBeCloseTo(Math.atan2(-4, 6), 2) // toward the hero's start (0, 0)
  })

  it('a look turns the head and then it settles back, still on the spot', () => {
    const looked = { ...STAND, actions: [{ kind: 'look' as const, at: 0, seconds: 3, deg: 60 }] }
    const a = ev(looked), p0 = a.pose(1.5).q.map((q) => q.clone()), p1 = ev(STAND).pose(1.5).q
    expect(p0.some((q, i) => q.angleTo(p1[i]) > 0.1)).toBe(true)
    expect(a.anchor(40).x).toBeCloseTo(4, 3)
  })

  it('stands at its spot from t=0 whatever its delay, on the idle clip; a walker with the same delay does not', () => {
    const plan: PerformancePlan = { ...STRAIGHT, extras: [STAND, { ...STAND, stand: undefined, face: undefined, path: [[4, -6], [10, -6]] }] }
    const p = performerFrom(plan, () => 0, lib)
    const stander = p.object.children.find((c) => c.userData.entity === 'extra:0:1')!
    p.poseAt(0); const a = centre(stander)
    p.poseAt(8); const b = centre(stander)
    expect(a.x).toBeCloseTo(4, 0)
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(0.3)
    expect(p.tracks.find((t) => t.id === 'extra:0:1')!.at(8)[0]).toBeCloseTo(4, 2)
  })

  it('pose is pure in t: asking out of order gives the same joints', () => {
    const e = ev({ ...STAND, actions: [{ kind: 'look', at: 0, seconds: 3, deg: 60 }] })
    const first = e.pose(1.7).q[3].clone()
    e.pose(9); e.pose(0.2)
    expect(e.pose(1.7).q[3].angleTo(first)).toBe(0)
  })
})

describe('a walking extra with actions', () => {
  it('stops and looks at its action, scaled to the figure', () => {
    const w: ExtraPlan = { path: [[0, 0], [0, -8]], gait: 'walk', delay: 0, costume: 'modern', variant: 0, actions: [{ kind: 'look', at: 4, seconds: 2, deg: 40 }] }
    const plan = extraMotionPlan(w, 0.95, [0, 0])
    expect(plan.actions![0].at).toBeCloseTo(4 / 0.95, 6)
    const tl = compile(plan, lib)
    expect(tl.segs.some((s) => s.kind === 'look')).toBe(true)
  })
})

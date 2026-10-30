import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { CLIPS } from '../clips.ts'
import { compile } from '../motion/compile.ts'
import { parseBvh, sampleRoot } from '../motion/bvh.ts'
import type { Library } from '../motion/library.ts'
import { retarget, sampleSource } from '../motion/retarget.ts'
import { fk, fkBuffers, legLength, makePose, skeletonOf } from '../motion/skeleton.ts'
import { evaluator } from '../motion/timeline.ts'
import { smoothPath } from '../motion/path.ts'
import { KNEEL_UP, L_PATH, diskLibrary, readClip } from './motion.fixture.ts'

let lib: Library
beforeAll(async () => { lib = await diskLibrary() }, 60_000)

describe('canonical skeleton retarget', () => {
  it('bone lengths stay the canonical ones through a timeline that mixes four CMU subjects', () => {
    const C = lib.canon, rest = C.offsets.map((o) => o.length()), { pos, rot } = fkBuffers(C)
    for (const plan of [L_PATH, KNEEL_UP]) {
      const tl = compile(plan, lib), ev = evaluator(tl)
      for (let t = 0; t <= tl.duration; t += 0.37) {
        fk(C, ev.pose(t), pos, rot)
        C.parents.forEach((p, j) => { if (p >= 0) expect(pos[j].distanceTo(pos[p])).toBeCloseTo(rest[j], 7) })
      }
    }
  })

  it('takes rotations by joint name and scales root travel by the leg-length ratio', () => {
    const own = parseBvh(readClip(CLIPS.stop.url)), src = retarget(own, lib.canon), skel = skeletonOf(own)
    expect(legLength(skel)).not.toBeCloseTo(legLength(lib.canon), 2) // a different subject: the ratio matters
    expect(src.ratio).toBeCloseTo(legLength(lib.canon) / legLength(skel), 12)
    const p = makePose(lib.canon.names.length), raw = new THREE.Vector3(), f = 200, t = f * own.frameTime
    sampleSource(src, t, p); sampleRoot(own, f, raw)
    raw.multiplyScalar(src.ratio).toArray().forEach((v, i) => expect(p.root.getComponent(i)).toBeCloseTo(v, 7))
    const j = lib.canon.index.RightForeArm, s = skel.index.RightForeArm
    const want = own.quats.slice((f * own.joints.length + s) * 4, (f * own.joints.length + s) * 4 + 4)
    p.q[j].toArray().forEach((v, i) => expect(v).toBeCloseTo(want[i], 6))
  })

  it('every shipped clip retargets with all canonical joints present and a usable window', () => {
    for (const [id, c] of Object.entries(lib.clips)) {
      if (!c) continue // a kept user move whose files did not load is not in the lookup; shipped clips always are
      expect(c.def.in, id).toBeGreaterThanOrEqual(c.t0); expect(c.def.out, id).toBeLessThanOrEqual(c.t1)
      const src = retarget(parseBvh(readClip(c.def.url)), lib.canon)
      expect(src.map.every((m) => m >= 0), id).toBe(true)
    }
  })
})

describe('rounded path', () => {
  it('rounds a corner into an arc that keeps the heading continuous and maps plan metres onto it', () => {
    const p = smoothPath([[0, 0], [0, -5], [4, -5]], 1.2, () => false), y0 = p.at(0).yaw
    let worst = 0
    for (let s = 0.01; s <= p.length; s += 0.01) worst = Math.max(worst, Math.abs(p.at(s).yaw - p.at(s - 0.01).yaw))
    expect(THREE.MathUtils.radToDeg(worst)).toBeLessThan(1)
    expect(THREE.MathUtils.radToDeg(p.at(p.length).yaw - y0)).toBeCloseTo(-90, 6)
    expect(p.length).toBeLessThan(9) // the arc cuts the corner
    const end = p.at(p.fromPlan(9)); expect(end.x).toBeCloseTo(4, 9); expect(end.z).toBeCloseTo(-5, 9)
    const sharp = smoothPath([[0, 0], [0, -5], [4, -5]], 1.2, (o) => o === 5)
    expect(sharp.length).toBeCloseTo(9, 9)
    expect(sharp.corners).toEqual([{ o: 5, turn: -Math.PI / 2, sharp: true }])
  })
})

// The walk stumble, take 2 (2026-10-28): after the toe-off jitter and the run's stop were fixed the owner still saw a stumble at Slow
// walk, Walk and Run. Measured on the walk cycle played in place: the capture's cycle does not end on its first pose (the planted
// left foot sits 5 cm further along at `out` than one cycle before), and the loop paid that gap in a quarter-second fade at the
// seam, while the left foot was planted: it skated at 0.3 to 0.4 m/s where the capture holds it still, once per cycle (motion/clip.ts,
// loop closure). These pin the planted feet still through the seam, the cycle closed, and the feet on the floor all the way round.
import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { parseBvh } from '../motion/bvh.ts'
import { FOOT_CLEAR } from '../motion/clip.ts'
import type { Library } from '../motion/library.ts'
import { retarget, sampleSource } from '../motion/retarget.ts'
import { fk, fkBuffers, makePose, type Pose } from '../motion/skeleton.ts'
import { smoothBvh } from '../motion/smooth.ts'
import { diskLibrary, readClip } from './motion.fixture.ts'

let lib: Library
beforeAll(async () => { lib = await diskLibrary() }, 60_000)

const LOOPS = ['walk', 'run', 'idle'] as const
const PLANTED = 0.006 // m above the toe's resting height (FOOT_CLEAR): a toe this low is on the ground
const TOES = ['LeftToeBase', 'RightToeBase'], FEET = ['LeftFoot', 'RightFoot', ...TOES]

/** world positions of `joints` for a pose */
function world(p: Pose, joints: string[]): THREE.Vector3[] {
  const { pos, rot } = fkBuffers(lib.canon)
  fk(lib.canon, p, pos, rot)
  return joints.map((n) => pos[lib.canon.index[n]].clone())
}

describe('the gait loop seam', () => {
  it('a planted toe moves as the capture moves it, through the seam and all the way round (walk, run)', () => {
    // before: in the walk's last quarter second the planted left toe slid 0.26 m/s (0.1 s mean) faster than the capture moves it
    for (const id of ['walk', 'run'] as const) {
      const c = lib.clips[id], v = c.stride / c.cycle, src = retarget(smoothBvh(parseBvh(readClip(c.def.url))), lib.canon)
      const p = makePose(lib.canon.names.length), dt = 1 / 120, win: number[][] = [[], []]
      const loopToes = (u: number) => { c.loop(u, p); p.root.z += v * u; return world(p, TOES) } // in place, anchor at stride speed
      const rawToes = (u: number) => world(sampleSource(src, c.def.in + u, p), TOES) // the capture itself (file space)
      let worst = 0, where = ''
      for (let u = 0; u + dt < c.cycle; u += dt) {
        const a0 = loopToes(u), a1 = loopToes(u + dt), r0 = rawToes(u), r1 = rawToes(u + dt)
        a0.forEach((t, k) => {
          const vl = Math.hypot(a1[k].x - t.x, a1[k].z - t.z) / dt, vr = Math.hypot(r1[k].x - r0[k].x, r1[k].z - r0[k].z) / dt
          win[k].push(t.y < FOOT_CLEAR + PLANTED ? vl - vr : NaN); if (win[k].length > 12) win[k].shift()
          const m = win[k].length === 12 ? win[k].reduce((x, y) => x + y) / 12 : NaN
          if (m > worst) { worst = m; where = `${k ? 'right' : 'left'} toe at u ${u.toFixed(3)} of ${c.cycle.toFixed(3)}` }
        })
      }
      expect(worst, `${id}: ${worst.toFixed(3)} m/s over the capture, ${where}`).toBeLessThan(0.08)
    }
  })

  it('the cycle closes: no joint jumps as it wraps', () => {
    for (const id of LOOPS) {
      const c = lib.clips[id], a = makePose(lib.canon.names.length), b = makePose(lib.canon.names.length)
      c.loop(c.cycle - 1e-4, a); c.loop(c.cycle + 1e-4, b)
      expect(a.root.distanceTo(b.root), `${id} root`).toBeLessThan(1e-3)
      for (let j = 0; j < a.q.length; j++) expect(Math.abs(a.q[j].dot(b.q[j])), `${id} ${lib.canon.names[j]}`).toBeGreaterThan(0.9999)
    }
  })

  it('the lowest foot joint rests on the floor all the way round the walk (the closure does not sink or lift the feet)', () => {
    const c = lib.clips.walk, p0 = makePose(lib.canon.names.length)
    let lo = Infinity, hi = -Infinity
    for (let u = 0; u < c.cycle; u += 1 / 60) {
      c.loop(u, p0)
      const y = Math.min(...world(p0, FEET).map((t) => t.y))
      lo = Math.min(lo, y); hi = Math.max(hi, y)
    }
    // the pin is smoothed, so the lowest joint wanders a few mm either side of FOOT_CLEAR; the closure left unpinned sank it 1.4 cm
    expect(lo, 'into the floor').toBeGreaterThan(FOOT_CLEAR - 0.006)
    expect(hi, 'above the floor').toBeLessThan(FOOT_CLEAR + 0.012)
  })
})

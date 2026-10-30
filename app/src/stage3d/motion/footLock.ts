/**
 * Planted feet held through hand-offs (2026-10-28, the crossfade skate). Every hand-off crossfades two segments' world poses, and the
 * two never put a planted foot on the same spot: the segment shift lines up the hips, not the feet, and a stop, an idle or a turn
 * each stand on their own stance. Measured on Walk to a spot: the right toe is still in the walk and still in the stop, 27 cm apart,
 * so the blend dragged it 14 cm across the floor at up to 1.2 m/s as the stop began; the stop into the idle slid the right foot 21 cm
 * with neither clip moving it. Picking another stop frame cannot help: the two stances differ, not the timing.
 *
 * A contact: the toe low and still in the world pose of the segment the blend mostly shows. A contact that overlaps a crossfade is
 * held: from where it began, the toe is pinned through each crossfade it overlaps (motion/legIk.ts carries the leg), and between and
 * after them the error the pins built up is carried as a constant offset, so the clip's own small drift of a planted foot (a scaled
 * turn) still plays and the offset never grows past what the hand-offs made. The offset is let go over the swing after the toe
 * lifts, ending by its next contact, so the foot lands where the clip puts it. Contacts away from hand-offs play as the clip has them.
 * Built once per timeline on a 1/120 s grid; apply() is pure in t.
 */
import * as THREE from 'three'
import { FOOT_CLEAR } from './clip.ts'
import type { Timeline } from './compile.ts'
import { reachToe } from './legIk.ts'
import { segPose, smooth } from './segments.ts'
import { fk, fkBuffers, makePose, type Pose } from './skeleton.ts'

const DT = 1 / 120
/** a toe no higher than this above its resting height (FOOT_CLEAR; a heel-down foot lifts its toe 3 to 4 cm), and slower than STILL
 *  (m/s) in its own segment, is planted there */
const LOW = 0.05, STILL = 0.35
/** contacts this close are one (a toe flickering at the threshold), shorter than MIN s are none; the let-go spans the swing (at most
 *  RELEASE s) and ends by the next contact */
const GAP = 0.12, RELEASE = 0.5, MIN = 0.04
const LEGS = [['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase'], ['RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']]

/** a held stretch of one contact: the toe pinned at `pin` (xz) over [x0, x1], or carried by the constant offset `off` */
type Piece = { x0: number; x1: number; pin?: THREE.Vector3; off: THREE.Vector3 }
/** a held contact [a, b]: its pieces in order, then the let-go of `off` over `rel` seconds after b */
export type Hold = { a: number; b: number; pieces: Piece[]; off: THREE.Vector3; rel: number }
export type FootLock = { apply(t: number, pose: Pose): Pose; holds: Hold[][]
  /** how free leg k (0 left, 1 right) is of its hold at t: 0 while held, rising to 1 over the let-go, 1 with none */
  free(t: number, k: number): number }

/** `raw(t, out)` is the crossfaded pose; `weights(t)` the segments playing at t and their blend weights */
export function footLock(tl: Timeline, raw: (t: number, out: Pose) => Pose, weights: (t: number) => { i: number; w: number }[]): FootLock {
  const sk = tl.lib.canon, legs = LEGS.map((l) => l.map((n) => sk.index[n]))
  if (legs.some((l) => l.some((j) => j === undefined))) return { apply: (_t, p) => p, holds: [], free: () => 1 }
  const { pos, rot } = fkBuffers(sk), P = makePose(sk.names.length), Q = makePose(sk.names.length)
  const N = Math.floor(tl.duration / DT) + 1, toes = legs.map((l) => l[3])
  const segToes = (i: number, t: number, out: Pose) => { segPose(tl.segs[i], t, out); fk(sk, out, pos, rot); return toes.map((j) => pos[j].clone()) }
  const rawToe = (t: number, k: number) => { raw(t, P); fk(sk, P, pos, rot); return pos[toes[k]].clone().setY(0) }
  const windows = tl.segs.flatMap((g, i) => (i && tl.xf[i] > 0 ? [[g.t0 - tl.xf[i] / 2, g.t0 + tl.xf[i] / 2] as const] : []))
  const on = legs.map(() => new Uint8Array(N))
  for (let s = 0; s < N; s++) {
    const t = s * DT, { i } = weights(t).reduce((x, y) => (y.w > x.w ? y : x)) // the segment the blend mostly shows
    const a = segToes(i, t, P), b = segToes(i, t + DT, Q)
    a.forEach((x, k) => { on[k][s] = x.y < FOOT_CLEAR + LOW && Math.hypot(b[k].x - x.x, b[k].z - x.z) / DT < STILL ? 1 : 0 })
  }
  const holds: Hold[][] = legs.map((_, k) => {
    const runs: [number, number][] = []
    for (let s = 0; s < N; s++) {
      if (!on[k][s]) continue
      const last = runs[runs.length - 1]
      if (last && (s - last[1]) * DT <= GAP) last[1] = s; else runs.push([s, s])
    }
    return runs.flatMap(([sa, sb], r) => {
      const a = sa * DT, b = sb * DT, hit = windows.filter(([w0, w1]) => a < w1 && b > w0)
      if (b - a < MIN || !hit.length) return []
      const pieces: Piece[] = []
      let off = new THREE.Vector3(), at = a
      hit.forEach(([w0, w1], h) => {
        const x0 = h ? Math.max(w0, at) : a, x1 = Math.min(w1, b)
        if (x0 > at) pieces.push({ x0: at, x1: x0, off: off.clone() })
        const pin = rawToe(x0, k).add(off)
        off = pin.clone().sub(rawToe(x1, k))
        pieces.push({ x0, x1, pin, off: off.clone() }); at = x1
      })
      if (b > at) pieces.push({ x0: at, x1: b, off: off.clone() })
      const next = runs[r + 1] ? runs[r + 1][0] * DT : Infinity
      return [{ a, b, pieces, off, rel: Math.min(RELEASE, next - b) }]
    })
  })
  const d = new THREE.Vector3()
  return {
    holds,
    free(t, k) {
      const h = holds[k]?.find((x) => t >= x.a && t <= x.b + x.rel)
      return !h ? 1 : t <= h.b ? 0 : smooth((t - h.b) / h.rel)
    },
    apply(t, pose) {
      let fresh = false
      legs.forEach((leg, k) => {
        const h = holds[k].find((x) => t >= x.a && t <= x.b + x.rel)
        if (!h) return
        if (!fresh) { fk(sk, pose, pos, rot); fresh = true }
        if (t > h.b) d.copy(h.off).multiplyScalar(1 - smooth((t - h.b) / h.rel))
        else {
          const p = h.pieces.find((x) => t <= x.x1) ?? h.pieces[h.pieces.length - 1]
          if (p.pin) d.copy(p.pin).sub(pos[leg[3]]).setY(0); else d.copy(p.off)
        }
        if (d.lengthSq() > 1e-10) { reachToe(sk, pose, pos, rot, leg, d); fk(sk, pose, pos, rot) }
      })
      return pose
    },
  }
}

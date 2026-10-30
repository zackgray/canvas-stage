/**
 * A library clip, analysed once and sampled in an aligned frame: facing +z at its reference yaw, the root's xz given as a residual from
 * a base point (the stripped travel), and root y given as height above the clip's own floor. Pure functions of clip time.
 */
import * as THREE from 'three'
import type { ClipDef, ClipId, GenClipId } from '../clips.ts'
import { sampleSource, type Source } from './retarget.ts'
import { facingYaw, fk, fkBuffers, makePose, type Pose, type Skeleton } from './skeleton.ts'

/** the lowest foot joint sits this high above the ground (the toe and ankle capsules have about this radius) */
export const FOOT_CLEAR = 0.035
const FEET = ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot']
const Y = new THREE.Vector3(0, 1, 0)
/** the joints whose swing a gait clip's `armSwing` scales */
const ARMS = ['LeftArm', 'RightArm']

export type Clip = {
  /** the library id: a builtin ClipId, or gen:<motion-id> for a kept user move (track D) */
  id: ClipId | GenClipId
  def: ClipDef
  /** canonical joint count (pose size) */
  joints: number
  /** first and last usable file time */
  t0: number
  t1: number
  /** travel direction (unit xz, clip space) over [in, out] and its yaw */
  dir: THREE.Vector3
  refYaw: number
  /** cycle length (s) and travel per cycle (m) */
  cycle: number
  stride: number
  /** forward progress (m) at file time τ, smoothed, 0 at `in` (progress clips; 0 for others) */
  prog(τ: number): number
  /** aligned pose at file time τ, played once */
  once(τ: number, out: Pose): Pose
  /** aligned pose u seconds into the [in, out] cycle (any u; wraps seamlessly, the cycle's end-to-start gap spread over it), root xz relative to the cycle's travel line */
  loop(u: number, out: Pose): Pose
}

export function analyseClip(id: ClipId | GenClipId, def: ClipDef, src: Source, canon: Skeleton): Clip {
  const n = canon.names.length, raw = makePose(n), { pos, rot } = fkBuffers(canon)
  const dt = src.bvh.frameTime, t0 = 0, t1 = src.duration
  const hipAt = (τ: number) => sampleSource(src, τ, raw).root.clone().setY(0)
  // ground contact: the lowest foot joint per frame. Retargeted rotations on canonical bones put the stance foot at a slightly
  // different height every frame, so grounded clips pin their lowest foot to the floor (lightly smoothed); clips with flight phases
  // (the run) keep one floor, the lowest point over the window.
  const N = src.bvh.frames, low = new Float64Array(N), G = new Float64Array(N), feet = FEET.map((f) => canon.index[f])
  for (let f = 0; f < N; f++) { sampleSource(src, f * dt, raw); fk(canon, raw, pos, rot); low[f] = Math.min(...feet.map((j) => pos[j].y)) }
  const i0 = Math.round(def.in / dt), i1 = Math.min(Math.round(def.out / dt), N - 1)
  const floor = Math.min(...low.slice(i0, i1 + 1)), gk = Math.round(0.06 / dt)
  for (let f = 0; f < N; f++) {
    if (def.flight) { G[f] = floor; continue }
    let s = 0, c = 0
    for (let k = Math.max(0, f - gk); k <= Math.min(N - 1, f + gk); k++) { s += low[k]; c++ }
    G[f] = s / c
  }
  const groundAt = (τ: number) => { const x = Math.min(Math.max(τ / dt, 0), N - 1), f = Math.floor(x), g = Math.min(f + 1, N - 1); return G[f] + (G[g] - G[f]) * (x - f) }
  const h0 = hipAt(def.in), h1 = hipAt(def.out), travel = h1.clone().sub(h0)
  const stride = travel.length()
  const pinned = def.root === 'pinned'
  sampleSource(src, def.in, raw)
  const dir = pinned || stride < 1e-6 ? new THREE.Vector3(Math.sin(facingYaw(raw.q[0])), 0, Math.cos(facingYaw(raw.q[0]))) : travel.clone().normalize()
  const refYaw = Math.atan2(dir.x, dir.z)
  const align = new THREE.Quaternion().setFromAxisAngle(Y, -refYaw)

  // smoothed forward progress along dir, every frame of the file (0.5 s centred mean, then non-decreasing)
  const along = new Float64Array(N), P = new Float64Array(N), half = Math.round(0.25 / dt)
  for (let f = 0; f < N; f++) along[f] = hipAt(f * dt).sub(h0).dot(dir)
  for (let f = 0; f < N; f++) {
    let s = 0, c = 0
    for (let k = Math.max(0, f - half); k <= Math.min(N - 1, f + half); k++) { s += along[k]; c++ }
    P[f] = f ? Math.max(P[f - 1], s / c) : s / c
  }
  const rawProg = (τ: number) => { const x = Math.min(Math.max(τ / dt, 0), N - 1), f = Math.floor(x), g = Math.min(f + 1, N - 1); return P[f] + (P[g] - P[f]) * (x - f) }
  const p0 = rawProg(def.in)
  const prog = def.root === 'progress' ? (τ: number) => rawProg(τ) - p0 : () => 0

  const base = new THREE.Vector3()
  /** raw sample at τ, re-expressed relative to `base` (clip space) and aligned */
  function aligned(τ: number, out: Pose): Pose {
    sampleSource(src, τ, out)
    const y = out.root.y - groundAt(τ) + FOOT_CLEAR
    out.root.setY(0).sub(base).applyQuaternion(align).setY(y)
    out.q[0].premultiply(align)
    return out
  }
  function once(τ: number, out: Pose): Pose {
    const t = Math.min(Math.max(τ, t0), t1)
    base.copy(h0).addScaledVector(dir, prog(t))
    return aligned(t, out)
  }
  const L = def.out - def.in
  function at(u: number, out: Pose): Pose { // u in [0, L]: along the cycle's straight travel line
    base.copy(h0).addScaledVector(travel, u / L)
    return aligned(def.in + u, out)
  }
  // loop closure (2026-10-28, the walk stumble, take 2): a captured cycle never ends exactly on its first pose (CMU 35_01: the planted
  // left foot sits 5 cm further along at `out` than one cycle before). Fading the end into the frames before `in` over a quarter
  // second paid those 5 cm in that quarter second, while the left foot was planted: it skated at 0.3 to 0.4 m/s once per cycle, a
  // limp on every second step at every walking pace. The gap is now spread over the whole cycle: each joint turns a growing share of
  // its seam delta (and the root a share of its seam offset), so the cycle closes exactly with a drift of ~4 cm/s, below what reads.
  const head = at(0, makePose(n)), tail = at(L, makePose(n)), dq = tail.q.map((q, j) => {
    const d = q.clone().invert().multiply(head.q[j]) // X(out)⁻¹·X(in): X(out)·d = X(in)
    return d.w < 0 ? d.set(-d.x, -d.y, -d.z, -d.w) : d
  })
  const dRoot = head.root.clone().sub(tail.root), I = new THREE.Quaternion(), qk = new THREE.Quaternion()
  function closed(w: number, out: Pose): Pose {
    at(w, out)
    out.root.addScaledVector(dRoot, w / L)
    for (let j = 0; j < n; j++) out.q[j].multiply(qk.slerpQuaternions(I, dq[j], w / L))
    return out
  }
  // the shares turn the legs a little off the frames the floor was pinned on (up to 1.4 cm into or above it mid-cycle on the walk):
  // the closed cycle's own lowest foot is pinned again, as above (lightly smoothed, cyclic; one floor for a clip with flight phases)
  const LN = Math.max(2, Math.round(L * 120)), lift = new Float64Array(LN), lowC = new Float64Array(LN), m0 = makePose(n)
  for (let i = 0; i < LN; i++) { closed((i * L) / LN, m0); fk(canon, m0, pos, rot); lowC[i] = Math.min(...feet.map((j) => pos[j].y)) - FOOT_CLEAR }
  const lk = Math.round((0.06 * LN) / L), lmin = Math.min(...lowC)
  for (let i = 0; i < LN; i++) {
    if (def.flight) { lift[i] = lmin; continue }
    let s = 0
    for (let k = -lk; k <= lk; k++) s += lowC[(((i + k) % LN) + LN) % LN]
    lift[i] = s / (2 * lk + 1)
  }
  function loopRaw(u: number, out: Pose): Pose {
    const w = ((u % L) + L) % L, x = (w / L) * LN, i = Math.floor(x) % LN, g = (i + 1) % LN
    closed(w, out)
    out.root.y -= lift[i] + (lift[g] - lift[i]) * (x - Math.floor(x))
    return out
  }
  // arm swing: CMU 35_01 carries its arms almost still (a ~14 degree swing against a natural ~30+), so a gait clip may scale each arm's
  // swing about its own mean carriage over the cycle (def.armSwing). Pure in u: the mean is fixed once, here.
  const swing = def.armSwing ?? 1, arms = swing === 1 ? [] : ARMS.map((a) => canon.index[a]).filter((j) => j !== undefined)
  const carriage = arms.map(() => new THREE.Quaternion(0, 0, 0, 0))
  if (arms.length) {
    const ref = loopRaw(0, makePose(n)).q.map((q) => q.clone()), m = makePose(n)
    for (let u = 0; u < L; u += 1 / 60) {
      loopRaw(u, m)
      arms.forEach((j, i) => { const q = m.q[j], sgn = q.dot(ref[j]) < 0 ? -1 : 1; carriage[i].set(carriage[i].x + sgn * q.x, carriage[i].y + sgn * q.y, carriage[i].z + sgn * q.z, carriage[i].w + sgn * q.w) })
    }
    carriage.forEach((q) => q.normalize())
  }
  const armQ = new THREE.Quaternion()
  function loop(u: number, out: Pose): Pose {
    loopRaw(u, out)
    arms.forEach((j, i) => { armQ.copy(out.q[j]); out.q[j].copy(carriage[i]).slerp(armQ, swing) })
    return out
  }
  return { id, def, joints: n, t0, t1, dir, refYaw, cycle: L, stride, prog, once, loop }
}

/** how different two aligned poses look (limb rotations + hip height): used to pick matching phases */
export function poseDistance(a: Pose, b: Pose): number {
  let d = Math.abs(a.root.y - b.root.y) * 4
  for (let j = 1; j < a.q.length; j++) d += 1 - Math.abs(a.q[j].dot(b.q[j]))
  return d
}

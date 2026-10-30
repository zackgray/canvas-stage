/**
 * Two-bone leg IK for the foot lock (motion/footLock.ts): carry a foot by a world offset with the hip fixed, the knee kept in its own
 * bend plane and the foot keeping its world rotation, so the toe moves by the offset too. Where that puts the ankle out of the leg's
 * reach the heel rises about the toe instead (the foot turns about the toe until the ankle is in reach), so a held toe never floats
 * off the floor on a straight leg; an offset the toe cannot reach even so is shortened to what it can (no pop at the limit). Pure.
 */
import * as THREE from 'three'
import type { Pose, Skeleton } from './skeleton.ts'

/** the leg is straight at this share of thigh + shin (a hair short, so the knee's bend plane stays defined) */
const STRAIGHT = 0.9995
/** metres of the thigh's forward added to the knee's own offset when choosing the bend (decides only for a near-straight leg) */
const POLE = 0.03
/** metres short of R over which the leg's reach eases into it (see the soft reach below) */
const SOFT = 0.003

const u = new THREE.Vector3(), bend = new THREE.Vector3(), tgt = new THREE.Vector3(), knee = new THREE.Vector3(), toe = new THREE.Vector3()
const e = new THREE.Vector3(), v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), was = new THREE.Vector3(), dd = new THREE.Vector3()
const dq = new THREE.Quaternion(), rUp = new THREE.Quaternion(), rKn = new THREE.Quaternion(), rFt = new THREE.Quaternion(), inv = new THREE.Quaternion()

/**
 * move leg [upLeg, leg, foot, toe] of pose `p` so its toe goes by `d` (world). `pos`/`rot` hold the pose's FK on entry (stale on exit).
 */
export function reachToe(sk: Skeleton, p: Pose, pos: THREE.Vector3[], rot: THREE.Quaternion[], [up, kn, an, tb]: number[], d: THREE.Vector3): void {
  const H = pos[up], K = pos[kn], A = pos[an], T = pos[tb], l1 = K.distanceTo(H), l2 = A.distanceTo(K), lf = A.distanceTo(T), R = (l1 + l2) * STRAIGHT
  // the toe's reach: hip to toe at most R + lf (a little less, so the heel-up solve below stays well posed)
  const M = R + 0.98 * lf, dl = d.lengthSq()
  e.copy(T).sub(H)
  dd.copy(d)
  if (dl > 0 && e.clone().add(d).length() > M) {
    const b = e.dot(d), c = e.lengthSq() - M * M, s = (-b + Math.sqrt(Math.max(0, b * b - dl * c))) / dl
    dd.multiplyScalar(Math.min(Math.max(s, 0), 1))
  }
  tgt.copy(A).add(dd)
  rFt.copy(rot[an])
  if (tgt.distanceTo(H) > R) { // heel up: the ankle on the sphere about the toe (radius lf) at reach R from the hip, on the foot's side
    toe.copy(T).add(dd)
    const D = toe.distanceTo(H)
    v0.copy(H).sub(toe).normalize()
    was.copy(tgt).sub(toe)
    v1.copy(was).addScaledVector(v0, -was.dot(v0))
    if (D < R + lf && D > Math.abs(R - lf) && v1.lengthSq() > 1e-12) {
      v1.normalize(); was.normalize()
      const c = (D * D + lf * lf - R * R) / (2 * D * lf), sn = Math.sqrt(Math.max(0, 1 - c * c))
      tgt.copy(toe).addScaledVector(v0, c * lf).addScaledVector(v1, sn * lf)
      rFt.premultiply(dq.setFromUnitVectors(was, v0.copy(tgt).sub(toe).normalize()))
    }
  }
  tgt.sub(H)
  // a soft reach: within SOFT of straight the leg's length eases toward R instead of stopping at it, so a knee that straightens under
  // a held toe slows into the limit rather than hitting it in a frame (the bend grows as the root of the shortfall, so a hard stop
  // turned a smooth approach into a jump in the knee's speed)
  const raw = Math.max(tgt.length(), 1e-4), dist = raw <= R - SOFT ? raw : R - SOFT * Math.exp(-(raw - (R - SOFT)) / SOFT)
  u.copy(tgt).normalize()
  // the bend: where the knee already points off the hip-target line, plus a little of the thigh's own forward, so a near-straight
  // leg (whose knee barely leaves the line) keeps bending forward instead of flipping between frames
  bend.set(0, 0, POLE).applyQuaternion(rot[up]).add(K).sub(H)
  bend.addScaledVector(u, -bend.dot(u)).normalize()
  const ca = Math.min(Math.max((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1), 1), sa = Math.sqrt(1 - ca * ca)
  knee.copy(H).addScaledVector(u, ca * l1).addScaledVector(bend, sa * l1)
  // thigh: turn its world rotation so the knee lands on `knee`
  dq.setFromUnitVectors(v0.copy(K).sub(H).normalize(), v1.copy(knee).sub(H).normalize())
  rUp.copy(dq).multiply(rot[up])
  p.q[up].copy(inv.copy(rot[sk.parents[up]]).invert()).multiply(rUp)
  // shin: from its direction once the thigh has turned, onto the target
  rKn.copy(rUp).multiply(p.q[kn])
  v0.copy(A).sub(K).applyQuaternion(dq).normalize()
  v1.copy(H).addScaledVector(u, dist).sub(knee).normalize()
  rKn.premultiply(dq.setFromUnitVectors(v0, v1))
  p.q[kn].copy(inv.copy(rUp).invert()).multiply(rKn)
  // the foot: its own world rotation (turned about the toe when the heel had to rise)
  p.q[an].copy(inv.copy(rKn).invert()).multiply(rFt)
}

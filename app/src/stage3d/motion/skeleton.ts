/**
 * The canonical skeleton (subject 35's bone offsets, the spike's figure) and poses on it. Every clip, whatever subject it came from,
 * is played on this one skeleton: only its joint rotations are used, so bone lengths never change between clips (retarget.ts).
 */
import * as THREE from 'three'
import type { Bvh } from './bvh.ts'

export type Skeleton = { names: string[]; parents: number[]; offsets: THREE.Vector3[]; index: Record<string, number> }

/** a pose on a skeleton: root position (metres, world or clip space) and one local rotation per joint (q[0] = root rotation) */
export type Pose = { root: THREE.Vector3; q: THREE.Quaternion[] }

export function skeletonOf(b: Bvh): Skeleton {
  const names = b.joints.map((j) => j.name)
  return { names, parents: b.joints.map((j) => j.parent), offsets: b.joints.map((j) => j.offset.clone()), index: Object.fromEntries(names.map((n, i) => [n, i])) }
}

/** hip-to-ankle length (thigh + shin) of a skeleton: the retarget ratio for root travel and height */
export function legLength(s: Skeleton): number {
  const len = (n: string) => s.offsets[s.index[n]]?.length() ?? 0
  return (len('LeftLeg') + len('LeftFoot') + len('RightLeg') + len('RightFoot')) / 2
}

export function makePose(n: number): Pose { return { root: new THREE.Vector3(), q: Array.from({ length: n }, () => new THREE.Quaternion()) } }

export function copyPose(dst: Pose, src: Pose): Pose {
  dst.root.copy(src.root)
  for (let i = 0; i < dst.q.length; i++) dst.q[i].copy(src.q[i])
  return dst
}

/** dst = a blended toward b by w (per-bone slerp, root lerp); dst may alias a */
export function blendPose(dst: Pose, a: Pose, b: Pose, w: number): Pose {
  dst.root.lerpVectors(a.root, b.root, w)
  for (let i = 0; i < dst.q.length; i++) dst.q[i].slerpQuaternions(a.q[i], b.q[i], w)
  return dst
}

const qp = new THREE.Quaternion()
/** forward kinematics: world joint positions (and optionally world rotations) of a pose */
export function fk(s: Skeleton, p: Pose, pos: THREE.Vector3[], rot: THREE.Quaternion[]): void {
  for (let j = 0; j < s.names.length; j++) {
    const par = s.parents[j]
    if (par < 0) { pos[j].copy(p.root).add(s.offsets[j]); rot[j].copy(p.q[j]); continue }
    qp.copy(rot[par])
    pos[j].copy(s.offsets[j]).applyQuaternion(qp).add(pos[par])
    rot[j].copy(qp).multiply(p.q[j])
  }
}

/** world-position / world-rotation scratch arrays sized for a skeleton */
export function fkBuffers(s: Skeleton): { pos: THREE.Vector3[]; rot: THREE.Quaternion[] } {
  return { pos: s.names.map(() => new THREE.Vector3()), rot: s.names.map(() => new THREE.Quaternion()) }
}

/** yaw (radians) of a rotation's facing: the rotated +z axis projected on the ground, 0 = facing +z, + = toward +x */
const fz = new THREE.Vector3()
export function facingYaw(q: THREE.Quaternion): number {
  fz.set(0, 0, 1).applyQuaternion(q)
  return Math.atan2(fz.x, fz.z)
}

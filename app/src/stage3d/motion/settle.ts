/**
 * The settle (2026-10-29, the settle snap). When a walk arrives, the stop clip hands over to the idle (CMU 111, another performer) in
 * the 0.4 s crossfade, and their upper bodies stand differently. Crossing that in 0.4 s turned the chest at 154 degrees/s with the old
 * stop clip (CMU 133); with today's (CMU 16_34) the head turns at 70-75 degrees/s, against the stop source's own peaks of 47 (chest)
 * and 45 (head).
 *
 * An inertialized hand-off for the upper body alone: the idle that follows a stop starts with each spine, neck, head and arm joint
 * turned by its offset from the stop's last pose, and the offset decays to nothing over SETTLE_S, so the crossfade itself barely moves
 * the upper body and the idle's own pose arrives slowly. The chain's top joint (the lower back) takes its offset in the world, through
 * each clip's own pelvis: the two pelvises stand differently too, and a local offset alone left the chest riding the pelvis's turn
 * through the crossfade (50 degrees/s). The hips, the legs and the root are not touched, so the root path and the foot lock are
 * exactly as before. Only plans that carry `softSettle` take it (stamped by the server on a walk saved new or changed). Pure in t.
 */
import * as THREE from 'three'
import type { Seg } from './segments.ts'
import { smooth } from './segments.ts'
import { makePose, type Pose, type Skeleton } from './skeleton.ts'

/** seconds over which the upper body's offset from the stop decays into the idle */
export const SETTLE_S = 1.2
const ROOT_OF_UPPER = 'LowerBack'

/** the joints under the lower back: spine, neck, head, both arms */
export function upperJoints(skel: Skeleton): number[] {
  const top = skel.index[ROOT_OF_UPPER]
  if (top === undefined) return []
  const under = (j: number): boolean => j === top || (j >= 0 && skel.parents[j] >= 0 && under(skel.parents[j]))
  return skel.names.map((_, j) => j).filter(under)
}

const Y = new THREE.Vector3(0, 1, 0)

/** `seg` (the idle after a stop) with its upper body starting on the stop's (`prev`) last pose and settling over `dur` */
export function settleFrom(seg: Seg, prev: Seg, skel: Skeleton, dur = SETTLE_S): Seg {
  const joints = upperJoints(skel), n = skel.names.length, at0 = seg.local(seg.t0, makePose(n)), from = prev.local(prev.t1, makePose(n))
  // the pelvis in the world (each segment turns its clip pose by its body yaw), for the top joint's world offset
  const pelvis = (s: Seg, t: number, p: Pose) => new THREE.Quaternion().setFromAxisAngle(Y, s.bodyYaw(t)).multiply(p.q[0])
  const top = skel.index[ROOT_OF_UPPER], lift = pelvis(seg, seg.t0, at0).invert().multiply(pelvis(prev, prev.t1, from))
  const off = joints.map((j) => {
    const want = j === top ? lift.clone().multiply(from.q[j]) : from.q[j].clone(), d = want.multiply(at0.q[j].clone().invert())
    return d.w < 0 ? d.set(-d.x, -d.y, -d.z, -d.w) : d
  })
  const inner = seg.local.bind(seg), I = new THREE.Quaternion(), q = new THREE.Quaternion()
  seg.local = (t, out) => {
    inner(t, out)
    const k = 1 - smooth((t - seg.t0) / dur)
    if (k > 0) joints.forEach((j, i) => out.q[j].premultiply(q.slerpQuaternions(I, off[i], k)))
    return out
  }
  return seg
}

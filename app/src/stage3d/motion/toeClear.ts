/**
 * Swing-toe clearance (2026-10-29, the walk stumble, take 3). The stop clip brings the swinging foot in toe-first: with the first stop
 * clip (CMU 133_11) the right toe skimmed the floor at 3.1 to 3.6 m/s, 0.7 cm into it, twice in every stop; today's (CMU 16_34, a
 * slow walk to a stop, played on subject 35's bones) still drags a toe 0.6 cm into the floor at swing speed for 0.11 to 0.17 s as
 * Walk to a spot stops, at every pace: a foot catching the ground mid-stride, a trip. The walk and run loops clear the floor (their
 * lowest swinging toe is 1.4 cm above standing height and lands heel first).
 *
 * A swinging toe (moving fast, and not one the foot lock is holding or still letting go) lower than CLEAR above its standing height
 * has its foot turned up about the ankle until it clears, so it comes in heel first like the loops. The ankle, knee and hip do not
 * move, and the loops (which already clear) are untouched. Pure in t: the toe's speed is read from the pose a moment before.
 */
import * as THREE from 'three'
import { FOOT_CLEAR } from './clip.ts'
import { fk, fkBuffers, type Pose, type Skeleton } from './skeleton.ts'

/** the toe's lowest height (m) above its standing height while it swings */
export const CLEAR = 0.014
/** toe ground speed (m/s): no correction at or under SWING[0], the full one from SWING[1] (the stumbling swing measures 2.4 m/s at
 *  Slow walk, 3.6 at Walk); a soft ramp, so the lift fades as the foot lands instead of dropping it in a frame */
export const SWING: [number, number] = [0.6, 1.8]
const DT = 1 / 30 // the speed over a thirtieth of a second: a hand-off that starts a toe moving within a frame does not snap the lift in
const LEGS = [['LeftFoot', 'LeftToeBase'], ['RightFoot', 'RightToeBase']]

export type ToeClear = (t: number, pose: Pose) => Pose

/**
 * `raw(t, out)`: the pose before this pass (its toe speed tells a swing from a planted foot); `free(t, k)`: 0 while the foot lock
 * holds leg k, rising to 1 as it lets go (motion/footLock.ts), so a toe the lock releases at speed is not lifted in a frame
 */
export function toeClear(sk: Skeleton, raw: (t: number, out: Pose) => Pose, scratch: Pose, free: (t: number, k: number) => number = () => 1): ToeClear {
  const legs = LEGS.map(([a, b]) => [sk.index[a], sk.index[b]] as const)
  if (legs.some(([a, b]) => a === undefined || b === undefined)) return (_t, p) => p
  const now = fkBuffers(sk), was = fkBuffers(sk), side = new THREE.Vector3(), lever = new THREE.Vector3(), q = new THREE.Quaternion()
  const inv = new THREE.Quaternion()
  return (t, pose) => {
    fk(sk, pose, now.pos, now.rot)
    let before = false
    for (const [k, [an, tb]] of legs.entries()) {
      const toe = now.pos[tb], low = FOOT_CLEAR + CLEAR - toe.y
      if (low <= 0) continue
      if (!before) { fk(sk, raw(t - DT, scratch), was.pos, was.rot); before = true }
      const v = Math.hypot(toe.x - was.pos[tb].x, toe.z - was.pos[tb].z) / DT
      const w = THREE.MathUtils.smoothstep(v, SWING[0], SWING[1]) * free(t, k)
      if (w <= 0) continue
      // turn the foot up about the ankle's horizontal axis across the foot, by the angle that lifts the toe by `low`
      lever.copy(toe).sub(now.pos[an])
      const flat = Math.hypot(lever.x, lever.z), len = lever.length()
      if (flat < 1e-4) continue
      const pitch = Math.asin(THREE.MathUtils.clamp(lever.y / len, -1, 1)), want = Math.asin(THREE.MathUtils.clamp((lever.y + low * w) / len, -1, 1))
      side.set(lever.z, 0, -lever.x).normalize() // horizontal, across the foot: a positive turn about it lifts the toe
      q.setFromAxisAngle(side, -(want - pitch))
      // world rotation of the foot turned by q, written back as its local rotation under its parent
      const parent = sk.parents[an]
      pose.q[an].copy(inv.copy(now.rot[parent]).invert().multiply(q).multiply(now.rot[an]))
      fk(sk, pose, now.pos, now.rot)
    }
    return pose
  }
}

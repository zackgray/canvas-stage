/**
 * Where a two-handed prop sits (Kimodo spike recipe, E146; 2026-10-25). The frame rides the MIDPOINT of both wrists, not one hand
 * bone (one hand misses the far wrist by 10-13 cm on average): its top bar runs along the wrist-to-wrist vector, it hangs world-down
 * about that bar, and it sits GRIP_DROP toward the palms. It keeps its own size; it is never stretched to the hands' spacing.
 * The hive is placed from the pose at the pick: centred under the wrist midpoint, its rim just above it. Pure (three.js maths only).
 */
import * as THREE from 'three'

/** metres the frame's top bar sits below the wrist midpoint (toward the palms) */
export const GRIP_DROP = 0.03
/** metres the hive's rim stands above the wrists at the pick (the frame's top bar is then just under the rim, inside the box) */
export const RIM_ABOVE_WRISTS = 0.01

const UP = new THREE.Vector3(0, 1, 0)
const vx = new THREE.Vector3(), vy = new THREE.Vector3(), vz = new THREE.Vector3(), m4 = new THREE.Matrix4()

/**
 * The frame's placement from the two wrist positions (world): `position` is the top bar's centre, `quaternion` turns the frame's own
 * axes (+x along the bar, +y up, hanging toward -y) so the bar lies along left→right wrist and the frame hangs world-down.
 */
export function framePlacement(left: THREE.Vector3, right: THREE.Vector3, out: { position: THREE.Vector3; quaternion: THREE.Quaternion }): void {
  out.position.copy(left).add(right).multiplyScalar(0.5)
  out.position.y -= GRIP_DROP
  vx.subVectors(right, left)
  if (vx.lengthSq() < 1e-12) vx.set(1, 0, 0)
  vx.normalize()
  vy.copy(UP).addScaledVector(vx, -vx.dot(UP)) // up, made square to the bar
  if (vy.lengthSq() < 1e-9) vy.set(0, 0, 1) // the wrists one above the other: any roll will do
  vy.normalize()
  vz.crossVectors(vx, vy).normalize()
  out.quaternion.setFromRotationMatrix(m4.makeBasis(vx, vy, vz))
}

/** The hive under the pick: its centre (ground point of the wrist midpoint), its rim height above the ground there, its yaw (facing). */
export function hiveFromPick(left: THREE.Vector3, right: THREE.Vector3, groundY: number, bodyYaw: number): { at: [number, number]; rim: number; yaw: number } {
  const mx = (left.x + right.x) / 2, my = (left.y + right.y) / 2, mz = (left.z + right.z) / 2
  return { at: [mx, mz], rim: my - groundY + RIM_ABOVE_WRISTS, yaw: bodyYaw }
}

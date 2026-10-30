// The live clay view's shared parts (preview only): the one key-light uniform every clay material reads, the yaw that
// turns it, and the interface a layer (the performance, the surround) implements to follow the Clay look.
// The look matches the exported clay (experiments/e96_clay.py, e102): a warm key from camera-right, front and above,
// plus a soft fill, in grey only. The export shades in each frame's camera space, so the key is in VIEW space here too.
import { Vector3 } from 'three'

/** e96_clay.py KEY: camera space, x right, y up, z toward the viewer. No machine-readable scene light exists yet. */
export const CLAY_KEY_BASE: readonly [number, number, number] = [0.75, 0.25, 0.62]

/** The view-space key direction for a yaw (degrees, about the view's up axis; + swings it toward the left). */
export function clayKey(yawDeg: number, out = new Vector3()): Vector3 {
  const a = (yawDeg * Math.PI) / 180
  const [x, y, z] = CLAY_KEY_BASE
  return out.set(x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)).normalize()
}

/** One uniform object shared by every clay material, so turning the key reaches them all with no repaint. */
export const clayKeyUniform = { value: clayKey(0) }
let yaw = 0

export function setClayYaw(deg: number) {
  yaw = deg
  clayKey(deg, clayKeyUniform.value)
}
export const getClayYaw = () => yaw

/** A layer that draws in clay when the Clay look is on (Look finds it through `userData.clayTarget` or the surround). */
export interface ClayTarget { setClay(on: boolean): void }
export const isClayTarget = (v: unknown): v is ClayTarget => !!v && typeof (v as ClayTarget).setClay === 'function'

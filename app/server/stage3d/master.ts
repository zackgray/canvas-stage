/**
 * The master camera of a kit world (Stage3D): where its still is taken from, and what Perform reads as the world's lens and horizon.
 * It is the lab stage's default projector (engine/stageScene.ts PROJECTOR_POSITION / PROJECTOR_TARGET; a test keeps them equal),
 * so "snap to the master view" on Shoot shows the still. Pure; shared by the server and the browser.
 */

/** the still's size: the studio's frame (1920 x 1088, the clay and render size) */
export const KIT_STILL_W = 1920
export const KIT_STILL_H = 1088
/** focal of the master view, 36 mm-wide gate */
export const KIT_MASTER_MM = 24
export const KIT_MASTER_POSITION: [number, number, number] = [0, 1.6, 0]
export const KIT_MASTER_TARGET: [number, number, number] = [0, 1.0, -8]
/** the camera height a kit world is staged at (eye) */
export const KIT_EYE_HEIGHT_M = 1.6

/** vertical FOV (deg) of a focal on a 36 mm-wide gate at the still's aspect (the spike's `lens`) */
export function kitVfovDeg(mm = KIT_MASTER_MM, aspect = KIT_STILL_W / KIT_STILL_H): number {
  return (2 * Math.atan(18 / aspect / mm) * 180) / Math.PI
}

/** the image row the horizon crosses in the master still: the camera pitches down toward its target */
export function kitHorizonRow(vfovDeg = kitVfovDeg(), height = KIT_STILL_H): number {
  const [px, py, pz] = KIT_MASTER_POSITION, [tx, ty, tz] = KIT_MASTER_TARGET
  const pitch = Math.atan2(py - ty, Math.hypot(tx - px, tz - pz)) // looking down = positive
  const half = height / 2
  return half - half * (Math.tan(pitch) / Math.tan((vfovDeg * Math.PI) / 360))
}

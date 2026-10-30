// A placed piece's travel (prop-movement wave, 2026-10-28): where the piece stands at take time t when its plan item carries a
// `move` (a drawn ground path and a speed in metres per second). The path is smoothed with the walk's own corner rounding
// (motion/path.ts — the same path model the person's walk uses, not a second one); the piece starts at the path's first point at
// t = 0, runs the path at the stated speed and holds the end point past it. Facing: the travel heading is ADDED to the piece's
// base turn (KitItem.yawDeg), so a mesh squared up with a small base turn keeps that squaring while it travels; faceTravel false
// keeps the base turn alone. The base tilt (pitchDeg/rollDeg) stays applied under the heading, about the model's own axes.
// (front-faces, owner 2026-10-29) While it travels facing the way it goes, its resting turn is NOT added: the car drove sideways
// whenever it had been turned to look right at rest. Its front is the mesh's own turn offset (GlbPiece.yawOffsetDeg, which the
// card's 'Front faces' sets), so the front leads along the path whatever its resting turn; standing still, the turn is as before.
import type { KitItem, PieceMove } from './contract.ts'
import { LIMITS, clamp } from './planRules.ts'
import { distinctPoints, smoothPath, type Pt } from './motion/path.ts'

export type { PieceMove }

/** metres per second the speed presets set; a custom speed stays inside LIMITS.propSpeed */
export const MOVE_SPEEDS = [
  { id: 'slow', label: 'Slow', mps: 1 },
  { id: 'normal', label: 'Normal', mps: 3 },
  { id: 'fast', label: 'Fast', mps: 8 },
] as const

/** the same corner radius the walk's own paths round with (motion/compile.ts RADIUS) */
const RADIUS_M = 1.2
const RAD2DEG = 180 / Math.PI

/** the piece's smoothed path, or null when its `move` has no usable path (pure; built on demand, the paths are short) */
function smoothOf(it: KitItem): ReturnType<typeof smoothPath> | null {
  const m = it.move
  if (!m) return null
  const pts = distinctPoints(m.path)
  if (pts.length < 2) return null
  try { return smoothPath(pts, RADIUS_M, () => false) } catch { return null }
}

/** the piece's smoothed travel path; null with no usable move */
export function movePathOf(it: KitItem) { return smoothOf(it) }

/** seconds the piece's travel lasts; 0 with no usable move (a take's scrub and cap cover this) */
export function moveSeconds(it: KitItem): number {
  const p = smoothOf(it), m = it.move
  if (!p || !m) return 0
  return p.length / clamp(m.speed, LIMITS.propSpeed[0], LIMITS.propSpeed[1])
}

/** the piece's whole turn in degrees (about Y) for a pose on its path (null = resting): the resting turn plus the mesh's front
 *  offset; travelling with faceTravel on, the heading plus the front offset only. The ONE rule every placement uses (the live
 *  viewport, the built world, the captures and guide renders). */
export function pieceTurnDeg(it: KitItem, pose: { yawDeg: number } | null): number {
  const front = it.glb?.yawOffsetDeg ?? 0
  if (pose && it.move && it.move.faceTravel !== false) return pose.yawDeg + front
  return (it.yawDeg ?? 0) + front + (pose?.yawDeg ?? 0)
}

/**
 * The piece's place on its path at take time t: metres along = speed · t, clamped so it holds the path's end. Returns the ground
 * point and the travel heading in degrees to ADD to the piece's base turn (0 when faceTravel is false), or null with no usable
 * move (the caller then uses the resting place and turn).
 */
export function movePoseAt(it: KitItem, t: number): { at: Pt; yawDeg: number } | null {
  const p = smoothOf(it), m = it.move
  if (!p || !m) return null
  const s = Math.max(0, t) * clamp(m.speed, LIMITS.propSpeed[0], LIMITS.propSpeed[1])
  const q = p.at(Math.min(s, p.length))
  return { at: [q.x, q.z], yawDeg: m.faceTravel === false ? 0 : q.yaw * RAD2DEG }
}

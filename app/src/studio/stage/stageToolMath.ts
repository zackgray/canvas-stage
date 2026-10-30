// The Stage's transform tools, pure (step 13): where a grab (G), turn (R) or size (S) puts the picked thing for a pointer, from
// where it started. A move follows the ground under the pointer, or one world axis when an axis is picked (X, Z on the ground; Y is
// a piece's height); a turn follows the pointer across the screen; a size doubles for every SCALE_PX the pointer goes right (halves going left), so a
// 2 m piece reaches tens of metres within one sweep of the view. No DOM, no React.
import type { Ray, Vector3 } from 'three'
import { alongAxis, AXIS_DIR, type Axis } from '../../labs/projection/stage3d/moveGizmo'

export type ToolKind = 'move' | 'rotate' | 'scale'
type Pt = [number, number]

/** degrees per pixel a turn follows the pointer by; pixels for a doubling in size */
export const TURN_PER_PX = 0.5, SCALE_PX = 200

export interface ToolStart {
  /** the thing's place and facing when the tool began */
  at: Pt
  yaw: number
  /** the pointer (client px) when the tool began, or when the axis was last changed */
  mouse: { x: number; y: number }
  /** the ground point under the pointer at that moment (a free move keeps it under the pointer), or null */
  ground: Pt | null
  /** the thing's world position (the axis lines run through it) */
  origin: Vector3
  /** where along the picked axis the pointer was at that moment, or null */
  s0: number | null
}

/** what the tool does to the thing now: a new place and facing, a height change (m) and a size factor */
export interface ToolResult { at: Pt; yaw: number; lift: number; scale: number }

const r2 = (v: number) => Math.round(v * 100) / 100

/** the result of the tool for this pointer (client px) and its ray, ground point under it (or null) */
export function toolResult(kind: ToolKind, axis: Axis | null, s: ToolStart, mouse: { x: number; y: number }, ray: Ray, ground: Pt | null): ToolResult {
  const same: ToolResult = { at: s.at, yaw: s.yaw, lift: 0, scale: 1 }
  if (kind === 'rotate') return { ...same, yaw: Math.round(s.yaw + (mouse.x - s.mouse.x) * TURN_PER_PX) }
  if (kind === 'scale') return { ...same, scale: 2 ** ((mouse.x - s.mouse.x) / SCALE_PX) }
  if (axis) {
    const t = alongAxis(ray, s.origin, AXIS_DIR[axis])
    if (t === null || s.s0 === null) return same
    const d = t - s.s0
    if (axis === 'y') return { ...same, lift: r2(d) }
    return { ...same, at: axis === 'x' ? [r2(s.at[0] + d), s.at[1]] : [s.at[0], r2(s.at[1] + d)] }
  }
  if (!ground || !s.ground) return same
  return { ...same, at: [r2(s.at[0] + ground[0] - s.ground[0]), r2(s.at[1] + ground[1] - s.ground[1])] }
}

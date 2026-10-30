/**
 * Measuring the picked piece (plan section 2.3): the browser has the built Set, so it reads the piece's axis-aligned bounds at
 * the action point, after the auto-turn to face the piece, and expresses them in the performer's frame (figure at the origin
 * facing +Z). From that: `front` (hips to the near face), `rimOrTop` (the top height), `width`/`side` (the top's sizes), the
 * handled object's `grip` (a known prop's width, else a clamped share of the piece's width) and the piece's `distance` from the
 * point (the refusal when it is out of reach). Pure: plain trig, no three.js, no I/O.
 */
import { GRIP_MAX, GRIP_MIN } from './keys.ts'
import type { Vec3 } from './types.ts'

/**
 * A piece's bounds, world. `min`/`max` are axis-aligned; `corners` (optional) are the piece's own 8 corners when it is turned on
 * the Set, so a turned piece is measured as it stands rather than as the larger axis-aligned box around it.
 */
export type BoxLike = { min: Vec3; max: Vec3; corners?: Vec3[] }
/** the piece's bounds (`box`), the action point (`at`) and the performer's facing yaw (radians, 0 = facing +Z), all world */
export type MeasureInput = { box: BoxLike; at: Vec3; facingYaw?: number }

export type PieceMeasure = {
  /** metres from the hips to the piece's near face, straight ahead */
  front: number
  /** the top's height above the ground, metres */
  rimOrTop: number
  /** the opening or top's width, across the facing, metres */
  width: number
  /** the top's depth, along the facing, metres */
  side: number
  /** the handled object's grip width, metres (clamped to the band unless a known prop gives it) */
  grip: number
  /** the piece's nearest distance from the action point, metres (horizontal; the out-of-reach refusal reads this) */
  distance: number
}

/** the box's 8 corners: the piece's own when given, else the axis-aligned box's */
function corners({ min, max, corners: own }: BoxLike): Vec3[] {
  if (own && own.length) return own
  const [x0, y0, z0] = min, [x1, y1, z1] = max
  return [[x0, y0, z0], [x0, y0, z1], [x0, y1, z0], [x0, y1, z1], [x1, y0, z0], [x1, y0, z1], [x1, y1, z0], [x1, y1, z1]]
}

/** the nearest horizontal distance from the origin to the box (0 when the origin is inside it), local xz */
function rectDistance(xs: number[], zs: number[]): number {
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs)
  const dx = Math.max(x0, 0) - Math.min(x1, 0) // >0 only when the origin is outside on x
  const dz = Math.max(z0, 0) - Math.min(z1, 0)
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0))
}

/**
 * The piece in the performer's frame. `knownGrip` is the handled object's own width when it is a known prop (the frame is
 * 0.42 m); otherwise the grip is a clamped share of the piece's width. The piece's width says little about what is carried out
 * of it (a tray from a wide oven), and the motion computer drops more tries the wider the asked grip (live: 0.55 m lost 3-4 of 8
 * tries, the proven 0.42 m lost 1), so an unknown object's grip stops at UNKNOWN_GRIP_MAX.
 */
export const UNKNOWN_GRIP_MAX = 0.45

export function measurePiece(input: MeasureInput, knownGrip?: number): PieceMeasure {
  const yaw = input.facingYaw ?? 0
  const [ax, , az] = input.at
  // world -> performer-local is the inverse of her turn: facing yaw (0 = +Z) maps the local forward (0, 0, 1) to the world
  // (sin yaw, 0, cos yaw), so a world offset reads back as x = dx cos - dz sin (her left), z = dx sin + dz cos (ahead). (QA run 5:
  // the sign was flipped, which read a piece off to her side as 'behind her' and floored its distance to the hips.)
  const sin = Math.sin(yaw), cos = Math.cos(yaw)
  const local = corners(input.box).map(([x, , z]): [number, number] => {
    const dx = x - ax, dz = z - az
    return [dx * cos - dz * sin, dx * sin + dz * cos]
  })
  const xs = local.map(([x]) => x), zs = local.map(([, z]) => z)
  const ys = corners(input.box).map(([, y]) => y)
  const width = Math.max(...xs) - Math.min(...xs)
  const side = Math.max(...zs) - Math.min(...zs)
  const grip = knownGrip !== undefined ? Math.min(Math.max(knownGrip, GRIP_MIN), GRIP_MAX) : Math.min(Math.max(width * 0.6, GRIP_MIN), UNKNOWN_GRIP_MAX)
  return {
    front: nearestFace(zs),
    rimOrTop: Math.max(...ys),
    width, side, grip,
    distance: rectDistance(xs, zs),
  }
}

/** the near face along +Z: the smallest local z the box reaches, floored so the hands never start inside the performer */
function nearestFace(zs: number[]): number {
  return Math.max(Math.min(...zs), 0.05)
}

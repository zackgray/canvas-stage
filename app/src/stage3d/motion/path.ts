/**
 * The walked path: the plan's polyline with its corners rounded into circular arcs (a walking turn radius), except corners the
 * timeline keeps sharp because the performer stops there and turns in place. Arc length on the rounded path is `s`; the plan's own
 * metres (action `at`) are mapped onto it. Yaw: radians, 0 = facing +z, + = toward +x (a turn to his left).
 */
export type Pt = [number, number]
type Piece = { s0: number; len: number; o0: number; o1: number; a: Pt; yaw0: number; turn: number }

export type SmoothPath = {
  length: number
  /** point (x, z) and heading yaw at rounded arc length s (clamped; extrapolates straight past the ends) */
  at(s: number): { x: number; z: number; yaw: number }
  /** rounded arc length of plan metres `o` along the original polyline */
  fromPlan(o: number): number
  /** corner list: plan metres, turn angle (rad, + = left), whether it is kept sharp */
  corners: { o: number; turn: number; sharp: boolean }[]
}

export const yawOf = (dx: number, dz: number) => Math.atan2(dx, dz)
export const wrapAngle = (a: number) => { const t = (a + Math.PI) % (2 * Math.PI); return (t < 0 ? t + 2 * Math.PI : t) - Math.PI }

/**
 * @param radius walking turn radius (m), shrunk where the legs are short
 * @param keepSharp predicate on a corner's plan metres: true keeps it sharp (stop and turn in place)
 * @param maxRound corners turning more than this (rad) are always kept sharp
 */
/** the path without repeated points (a point within 1e-6 m of the one before it): what the walk is built on */
export const distinctPoints = (path: readonly Pt[]): Pt[] => path.filter((p, i) => i === 0 || Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) > 1e-6)

/** heading (rad) of the first leg, the walk's heading at s = 0 (smoothPath's first piece); null with fewer than two distinct points */
export function firstLegYaw(path: readonly Pt[]): number | null {
  const pts = distinctPoints(path)
  return pts.length < 2 ? null : yawOf(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1])
}

export function smoothPath(path: Pt[], radius: number, keepSharp: (o: number) => boolean, maxRound = (2 * Math.PI) / 3): SmoothPath {
  const pts = distinctPoints(path)
  if (pts.length < 2) throw new Error('a performance path needs two distinct points')
  const segLen = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]))
  const segYaw = pts.slice(1).map((p, i) => (i === 0 ? firstLegYaw(pts)! : yawOf(p[0] - pts[i][0], p[1] - pts[i][1])))
  const plan = [0]; for (const l of segLen) plan.push(plan[plan.length - 1] + l)
  // tangent length cut from each side of every corner
  const cut = pts.map(() => 0), corners: SmoothPath['corners'] = []
  for (let i = 1; i < pts.length - 1; i++) {
    const turn = wrapAngle(segYaw[i] - segYaw[i - 1])
    if (Math.abs(turn) < 1e-4) continue
    const sharp = Math.abs(turn) > maxRound || keepSharp(plan[i])
    corners.push({ o: plan[i], turn, sharp })
    if (!sharp) cut[i] = Math.min(radius * Math.tan(Math.abs(turn) / 2), 0.45 * segLen[i - 1], 0.45 * segLen[i])
  }
  const pieces: Piece[] = []
  let s = 0
  const push = (len: number, o0: number, o1: number, a: Pt, yaw0: number, turn: number) => { if (len > 1e-9) { pieces.push({ s0: s, len, o0, o1, a, yaw0, turn }); s += len } }
  for (let i = 0; i < segLen.length; i++) {
    const [ax, az] = pts[i], dx = Math.sin(segYaw[i]), dz = Math.cos(segYaw[i])
    const c0 = cut[i], c1 = cut[i + 1]
    push(segLen[i] - c0 - c1, plan[i] + c0, plan[i + 1] - c1, [ax + dx * c0, az + dz * c0], segYaw[i], 0)
    if (c1 > 0) { // the arc round corner i+1
      const turn = wrapAngle(segYaw[i + 1] - segYaw[i]), r = c1 / Math.tan(Math.abs(turn) / 2)
      const [bx, bz] = pts[i + 1]
      push(r * Math.abs(turn), plan[i + 1] - c1, plan[i + 1] + c1, [bx - dx * c1, bz - dz * c1], segYaw[i], turn)
    }
  }
  const length = s
  function at(q: number) {
    const k = Math.min(Math.max(q, 0), length)
    let p = pieces[0]
    for (const c of pieces) if (c.s0 <= k) p = c
    const d = q - p.s0 // distance into the piece (may run past the path ends: straight extrapolation)
    if (!p.turn || d <= 0 || d >= p.len) {
      const yaw = p.turn && d >= p.len ? p.yaw0 + p.turn : p.yaw0
      const [x0, z0] = p.turn && d >= p.len ? arcPoint(p, p.len) : p.a
      const e = p.turn ? (d >= p.len ? d - p.len : d) : d
      return { x: x0 + Math.sin(yaw) * e, z: z0 + Math.cos(yaw) * e, yaw }
    }
    const [x, z] = arcPoint(p, d)
    return { x, z, yaw: p.yaw0 + (p.turn * d) / p.len }
  }
  function fromPlan(o: number) {
    if (o <= 0) return o
    for (const p of pieces) if (o <= p.o1) return p.s0 + Math.max(0, ((o - p.o0) / (p.o1 - p.o0 || 1)) * p.len)
    return length + (o - plan[plan.length - 1])
  }
  return { length, at, fromPlan, corners }
}

/** point d metres along an arc piece: heading turns at a constant rate from yaw0 */
function arcPoint(p: Piece, d: number): Pt {
  const k = p.turn / p.len, y = p.yaw0 + k * d // curvature (rad/m)
  return [p.a[0] + (Math.cos(p.yaw0) - Math.cos(y)) / k, p.a[1] + (Math.sin(y) - Math.sin(p.yaw0)) / k]
}

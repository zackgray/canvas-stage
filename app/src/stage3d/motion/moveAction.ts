/**
 * A made move placed on the timeline (track D, docs/plan-kimodo-live.md 2.4, 2.5 and 8 Playback): the kept user clip plays like the
 * lift — pinned in, hold, out on its own file, crossfaded from standing — and when the move names a set piece (`toward`) off the
 * facing at the point, the turn clip plays first (2.5). A move whose clip did not load plays as Stop for its seconds, and a warning
 * naming it goes on the timeline's warnings (the channel the panel shows, compile.ts). Pure.
 */
import * as THREE from 'three'
import type { PathAction } from '../contract.ts'
import type { Clip } from './clip.ts'
import { wrapAngle } from './path.ts'
import { pinnedSeg, type Seg } from './segments.ts'

/** (plan 2.5) the piece is faced first when it stands more than this off the body's facing at the point */
export const TURN_TO_PIECE = THREE.MathUtils.degToRad(15)

/** what compile's station offers the move branch: its segment/turn machinery, the clip lookup and the warnings channel */
export type MoveCtx = {
  add: (seg: Seg) => Seg
  turn: (bodyDeg: number, intentDeg: number) => void
  /** stand still for `secs` (a stop segment), crossfade-clean from where the previous segment left the idle's phase */
  standStill: (kind: string, secs: number) => void
  at: { x: number; z: number }
  /** the station's intent yaw and body facing, read live (an auto-turn just played changes them) */
  yawNow: () => number
  bodyNow: () => number
  end: () => number
  last: boolean
  more: boolean
  lookup: (id: string) => Clip | undefined
  notes: Record<string, string>
  warn: (w: string) => void
}

/** the move's plain name for a warning: the user's own words when known, else the id */
const moveName = (a: PathAction, notes: Record<string, string>): string => {
  const note = a.motion ? notes[a.motion] : undefined
  return note ? `"${note}" (${a.motion})` : a.motion ? `"${a.motion}"` : '(no move named)'
}

export function addMoveAction(a: PathAction, ctx: MoveCtx): void {
  const secs = Math.max(a.seconds ?? 1, 0.2)
  const clip = a.motion ? ctx.lookup(a.motion) : undefined
  if (!clip) { // the kept move's files are gone: she stands still for it, and the warning names it
    ctx.warn(`The made move ${moveName(a, ctx.notes)} is missing its clip, so she stands still for its ${secs} s instead.`)
    return ctx.standStill('stop', secs)
  }
  if (a.toward) { // face the named piece first when it is more than ~15° off the facing at the point (plan 2.5)
    const pieceYaw = Math.atan2(a.toward[0] - ctx.at.x, a.toward[1] - ctx.at.z)
    const d = wrapAngle(pieceYaw - ctx.bodyNow())
    if (Math.abs(d) > TURN_TO_PIECE) ctx.turn(THREE.MathUtils.radToDeg(d), THREE.MathUtils.radToDeg(wrapAngle(pieceYaw - ctx.yawNow())))
  }
  // in, hold, out on the move's own file, like the lift and the kneel (pinned segments; the out plays only when more follows)
  const yaw = ctx.yawNow(), body = ctx.bodyNow(), U = clip.def
  const [h0, h1] = U.hold ?? [U.out, U.out], hold = Math.max(a.seconds ?? 2, 0.3)
  ctx.add(pinnedSeg('move', clip, ctx.at, yaw, body, U.in, h0, ctx.end()))
  ctx.add(pinnedSeg('move-hold', clip, ctx.at, yaw, body, h0, Math.min(h1, h0 + hold), ctx.end(), hold))
  if ((!ctx.last || ctx.more) && h1 < U.out - 1e-6) ctx.add(pinnedSeg('move-out', clip, ctx.at, yaw, body, h1, U.out, ctx.end()))
}

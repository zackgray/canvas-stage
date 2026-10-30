// The way the subject starts facing, as an arrowhead at the mark, for any top view drawn in the metre viewBox (x right, z down the page =
// toward the master camera, so yaw 0 points down the page, as the contract's +z). Drawn only: it takes no clicks. With a performance it
// shows what the take will play (startFacingDeg, the compiler's rule): a walk starts along its first leg, a stand faces the mark's yaw.
// The Set's MarkHandle passes the saved performance and the pose it is showing; Blocking passes its draft, so the arrow follows the path.
import type { PerformancePlan, ScenePlan } from '../../stage3d/contract'
import { markOf } from '../../stage3d/mark'
import { startFacingDeg } from '../../stage3d/motion/startFacing'

type Pt = [number, number]
/** `pose`: draw this instead of the plan's own mark (a drag in progress: a moved mark carries the walk's start with it) */
interface FacingProps {
  plan: Pick<ScenePlan, 'flat'> & Partial<Pick<ScenePlan, 'mark' | 'kit'>>
  pose?: { at: Pt; yaw: number } | null
  perf?: Pick<PerformancePlan, 'path' | 'stand'> | null
}

export function MarkFacing({ plan, pose, perf }: FacingProps) {
  const m = markOf(plan), at = pose?.at ?? m.at, moved = at[0] !== m.at[0] || at[1] !== m.at[1]
  const yaw = startFacingDeg(perf, pose?.yaw ?? m.yawDeg, moved ? at : undefined)
  const a = (yaw * Math.PI) / 180, fx = Math.sin(a), fz = Math.cos(a)
  const tip: Pt = [at[0] + fx * 1.0, at[1] + fz * 1.0], base: Pt = [at[0] + fx * 0.6, at[1] + fz * 0.6]
  const px = -fz * 0.28, pz = fx * 0.28
  return (
    <polygon data-testid="mark-facing" pointerEvents="none" fill="#ffc83c" stroke="#222" strokeWidth={0.04}
      points={`${tip[0]},${tip[1]} ${base[0] + px},${base[1] + pz} ${base[0] - px},${base[1] - pz}`} />
  )
}

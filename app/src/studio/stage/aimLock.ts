// fly-with-aim-lock: where the locked camera looks. The choice is the scene's Stage memory (stageMemory.ts); this resolves it to
// a world point on every frame: the subject's chest on the world clock, a placed piece where it stands on the world clock (its
// path point while it travels), or a point clicked on the ground. The aiming itself is the engine's (OperatorEngine.aimLock).
import { Vector3 } from 'three'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { pieceAimAt } from '../../labs/projection/operator/aimPiece'
import type { AimChoice } from './stageMemory'

/** the world point the camera stays aimed at for this choice right now, or null (nobody there, no such piece) */
export function aimTargetOf(lab: ProjectionLabState, aim: AimChoice): Vector3 | null {
  const groundAt = lab.kit?.layer?.groundAt ?? (() => 0)
  if (aim.kind === 'point') {
    const [x, z] = aim.at
    return new Vector3(x, groundAt(x, z), z)
  }
  if (aim.kind === 'piece') {
    const it = lab.kit?.world?.plan.kit[aim.index]
    if (!it) return null
    return pieceAimAt(it, groundAt, lab.op.engine.timeline.time) // follows a travelling piece on the world clock
  }
  const chest = lab.performance?.layer?.chestAt?.(lab.op.engine.timeline.time)
  return chest ? chest.clone() : null
}

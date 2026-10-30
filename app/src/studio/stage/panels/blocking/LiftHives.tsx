// The hive a lift brings, on a top view (Blocking's and the Set's): drawn where the performer will stand it, so the set is seen with
// it before anything is filmed. A lift that uses a hive of the set draws nothing here (the set's piece is already on the plan).
import type { KitItem, PathAction } from '../../../../stage3d/contract'
import { liftSpots } from '../../../../stage3d/props/liftSpots'
import type { Pt } from './blockingMath'

export function LiftHives({ path, actions, kit }: { path: Pt[]; actions: readonly PathAction[] | undefined; kit: readonly KitItem[] }) {
  const own = liftSpots(path, actions, kit).filter((s) => s.piece < 0)
  return (
    <>
      {own.map((s, i) => (
        <g key={i} data-testid={`lift-hive-${i}`} pointerEvents="none">
          <rect x={s.at[0] - 0.3} y={s.at[1] - 0.25} width={0.6} height={0.5} className="bl-top-piece bl-top-lift"><title>hive (comes with the lift)</title></rect>
          <text x={s.at[0] + 0.6} y={s.at[1] - 0.5} className="bl-top-label">hive (with the lift)</text>
        </g>
      ))}
    </>
  )
}

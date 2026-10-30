// The set pieces as handles over Blocking's top view (an SVG group in its metre viewBox; usePieceDrag.ts has the behaviour).
// Every kit piece can be dragged; a generated one (KitItem.glb) also shows its real footprint, from its kind's size. The picked
// piece shows a turn knob on its facing line. Clicks here never reach the top view (they would add a path point).
import type { ScenePlan } from '../../../../stage3d/contract'
import { pieceKindOf } from '../../../../stage3d/pieceKinds'
import { useCurrentScene } from '../../../../library/currentScene'
import { useEffect } from 'react'
import { usePieceDrag, type MovePiece, type SharedPoses } from './usePieceDrag'

const HANDLE = { fill: 'rgba(255, 200, 60, 0.18)', stroke: '#ffc83c', strokeWidth: 0.08, cursor: 'move' } as const
const FOOT = { fill: 'none', stroke: '#ffc83c', strokeWidth: 0.06, strokeDasharray: '0.3 0.2', pointerEvents: 'none' } as const
const KNOB = { fill: '#ffc83c', stroke: '#222', strokeWidth: 0.05, cursor: 'grab' } as const

/** the world a generated piece's mesh is under (its URL names it), for a plan read without its world id */
const worldOfPlan = (plan: ScenePlan) => plan.kit.map((it) => /\/locations\/(loc-[^/]+)\//.exec(it.glb?.url ?? '')?.[1]).find(Boolean) ?? null

/**
 * `onSelect`: told which piece is picked (null = none), for a toolbar beside the view (the Set's top view scales and removes it).
 * (set viewport) `selected`: a pick made in another view, shown here; `live`/`onDrag`: poses shared with the other views.
 */
export function PieceDragLayer({ plan, world, save, onSelect, selected, live, onDrag }: { plan: ScenePlan; world?: string | null; save?: MovePiece; onSelect?: (i: number | null) => void; selected?: number | null } & SharedPoses) {
  const current = useCurrentScene().view?.worldId ?? null
  const d = usePieceDrag(plan, world ?? current ?? worldOfPlan(plan), save, { live, onDrag })
  useEffect(() => { onSelect?.(d.sel) }, [d.sel]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selected !== undefined) d.setSel(selected) }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <g className="bl-top-pieces" data-testid="piece-drag-layer" onClick={(e) => e.stopPropagation()} onPointerMove={d.move} onPointerUp={d.up}>
      {plan.kit.map((it, i) => {
        const { at, yaw } = d.poseOf(i), s = it.scale ?? 1
        const r = it.glb ? Math.max(0.8, (pieceKindOf(it.kind).size * s) / 2) : 0.8 * s
        const a = (yaw * Math.PI) / 180, fx = Math.sin(a), fz = Math.cos(a)
        return (
          <g key={i} data-testid={`piece-handle-${i}`}>
            {it.glb && <circle cx={at[0]} cy={at[1]} r={r} style={FOOT} />}
            <line x1={at[0]} y1={at[1]} x2={at[0] + fx * r} y2={at[1] + fz * r} style={{ ...FOOT, strokeDasharray: undefined }} />
            <circle cx={at[0]} cy={at[1]} r={0.7} style={HANDLE} tabIndex={0} role="button" aria-label={`Move ${it.kind} (drag; [ and ] turn it)`}
              data-testid={`piece-drag-${i}`} onPointerDown={d.down(i, 'move')} onKeyDown={d.key(i)} onFocus={() => d.setSel(i)}>
              <title>{`${it.kind}: drag to move, [ and ] to turn`}</title>
            </circle>
            {d.sel === i && <circle cx={at[0] + fx * (r + 0.8)} cy={at[1] + fz * (r + 0.8)} r={0.4} style={KNOB} data-testid={`piece-turn-${i}`} onPointerDown={d.down(i, 'turn')}>
              <title>drag to turn</title></circle>}
          </g>
        )
      })}
      {d.error && plan.kit[d.error.index] && <text x={plan.kit[d.error.index].at[0] + 1} y={plan.kit[d.error.index].at[1]} className="bl-top-label" fill="#ff7a6b"
        data-testid="piece-drag-error">{d.error.text}</text>}
    </g>
  )
}

// The subject's mark on the Set's top view: a grey stand-in figure you drag to where they start (Blocking's path begins there), and a
// knob on its facing line to turn it. Drawn in the top view's metre viewBox; a drop saves once through `save` (setPlaceApi.mark).
// Clicks here never reach the view (they would add a path point).
import { useEffect, useState, type PointerEvent } from 'react'
import type { PerformancePlan, ScenePlan } from '../../stage3d/contract'
import { markOf } from '../../stage3d/mark'
import { toGround, yawToward } from '../stage/panels/blocking/usePieceDrag'
import { MarkFacing } from './MarkFacing'

type Pt = [number, number]
const BODY = { fill: '#9aa0a6', stroke: '#3c4043', strokeWidth: 0.06, cursor: 'move' } as const
const KNOB = { fill: '#9aa0a6', stroke: '#222', strokeWidth: 0.05, cursor: 'grab' } as const

/** (set viewport) `live`: the mark's pose as another view is drawing it; `onDrag`: told as it moves here; `onPick`: a press picks it */
interface MarkProps { plan: ScenePlan; perf?: Pick<PerformancePlan, 'path' | 'stand'> | null; save: (at: Pt, yawDeg: number) => Promise<void>; onError?: (text: string | null) => void
  live?: { at: Pt; yaw: number } | null; onDrag?: (pose: { at: Pt; yaw: number }) => void; onPick?: () => void; selected?: boolean }

export function MarkHandle({ plan, perf, save, onError, live, onDrag, onPick, selected }: MarkProps) {
  const stored = markOf(plan)
  const [drag, setDrag] = useState<{ mode: 'move' | 'turn'; at: Pt; yaw: number; moved: boolean } | null>(null)
  /** what was dropped and is being saved: drawn there until the re-read plan shows it */
  const [held, setHeld] = useState<{ at: Pt; yaw: number } | null>(null)
  useEffect(() => { setHeld(null) }, [plan.mark?.at[0], plan.mark?.at[1], plan.mark?.yawDeg])
  const pose = drag ?? live ?? held ?? { at: stored.at as Pt, yaw: stored.yawDeg }
  const a = (pose.yaw * Math.PI) / 180, fx = Math.sin(a), fz = Math.cos(a)

  const down = (mode: 'move' | 'turn') => (e: PointerEvent<SVGElement>) => {
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    onPick?.()
    setDrag({ mode, at: pose.at, yaw: pose.yaw, moved: false })
  }
  const move = (e: PointerEvent<SVGElement>) => {
    if (!drag) return
    e.stopPropagation()
    const p = toGround((e.currentTarget as SVGElement).ownerSVGElement, e.clientX, e.clientY)
    if (!p) return
    // a mark with no saved facing keeps facing the nearest prop as it moves (markOf); a saved facing stays as it was
    const next = drag.mode === 'move' ? { ...drag, at: p, yaw: plan.mark?.yawDeg === undefined ? markOf({ ...plan, mark: { at: p } }).yawDeg : drag.yaw, moved: true }
      : { ...drag, yaw: yawToward(drag.at, p), moved: true }
    setDrag(next)
    onDrag?.({ at: next.at, yaw: next.yaw })
  }
  const up = (e: PointerEvent<SVGElement>) => {
    if (!drag) return
    e.stopPropagation()
    ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
    if (drag.moved) {
      setHeld({ at: drag.at, yaw: drag.yaw }); onError?.(null)
      save(drag.at, drag.yaw).catch((err: unknown) => { setHeld(null); onError?.(`The mark was not moved: ${err instanceof Error ? err.message : String(err)}`) })
    }
    setDrag(null)
  }
  return (
    <g data-testid="set-mark" onClick={(e) => e.stopPropagation()} onPointerMove={move} onPointerUp={up}>
      <line x1={pose.at[0]} y1={pose.at[1]} x2={pose.at[0] + fx * 1.4} y2={pose.at[1] + fz * 1.4} stroke="#9aa0a6" strokeWidth={0.08} />
      <circle cx={pose.at[0]} cy={pose.at[1]} r={0.55} style={selected ? { ...BODY, stroke: '#ffc83c', strokeWidth: 0.14 } : BODY} data-testid="set-mark-body" onPointerDown={down('move')}
        tabIndex={0} role="button" aria-label="The subject's mark (arrows move it)" onFocus={onPick}><title>The subject's mark: drag to move it</title></circle>
      <circle cx={pose.at[0]} cy={pose.at[1] - 0.05} r={0.22} fill="#d5d8dc" pointerEvents="none" />
      <MarkFacing plan={plan} pose={pose} perf={perf} />
      <circle cx={pose.at[0] + fx * 1.4} cy={pose.at[1] + fz * 1.4} r={0.3} style={KNOB} data-testid="set-mark-turn" onPointerDown={down('turn')}><title>drag to turn</title></circle>
      <text x={pose.at[0] + 0.8} y={pose.at[1] - 0.7} className="bl-top-label">mark</text>
    </g>
  )
}

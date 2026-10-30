// Blocking's set seen from above (metres; x right, z toward the master camera): copied from Perform's TopView and extended with
// the extras' paths, the actions on the hero's points, the selected point and the kit pieces a path runs through. A click maps
// through groundPointAt, which honours the drawing's letterbox, and never reaches the 3D viewport (it stops here). With
// `onPointDrag` (the person panels), a path point after the first drags on the map: the press maps the same way the click does
// and each move carries the point; a press without a move stays a click. The Set's `layer` contract is untouched.
import { useRef, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { ExtraPlan, ScenePlan } from '../../../../stage3d/contract'
import { KIT_MASTER_POSITION, KIT_MASTER_TARGET } from '../../../../../server/stage3d/master'
import type { EditAction } from './blockingPlan'
import { groundPointAt, viewBox, type Pt } from './blockingMath'
import { PieceDragLayer } from './PieceDragLayer'
import type { MovePiece, SharedPoses } from './usePieceDrag'

export interface BlockingTopViewProps {
  plan: ScenePlan
  path: Pt[]
  extras: ExtraPlan[]
  actions: EditAction[]
  /** the selected hero point */
  point: number | null
  /** kit indices a path runs through (drawn red) */
  hits: number[]
  /** the extra being drawn, if any */
  drawingExtra: number | null
  /** the hero's first point: where a standing extra with no face point looks */
  heroStart?: Pt | null
  onPoint: (p: Pt) => void
  /** drag a hero path point (never point 1, the mark) to a new ground place, live */
  onPointDrag?: (i: number, p: Pt) => void
  /** the Set's top view (SetPlace): the world the pieces save to, who is told the picked piece, and what it draws over the pieces (labels, the mark) */
  layer?: { world?: string | null; save?: MovePiece; onSelect?: (i: number | null) => void; selected?: number | null } & SharedPoses
  children?: ReactNode
}

const ACTION_MARK: Record<string, string> = { stop: 'S', look: 'L', turn: 'T', kneel: 'K', lift: 'F', idle: 'I' }
const DRAG_PX = 4

export function BlockingTopView({ plan, path, extras, actions, point, hits, drawingExtra, heroStart = null, onPoint, onPointDrag, layer, children }: BlockingTopViewProps) {
  const box = viewBox(plan, [path, ...extras.map((e) => e.path)])
  const [x0, z0, x1, z1] = box
  const w = x1 - x0, h = z1 - z0
  const suppressClick = useRef(false)
  const click = (e: MouseEvent<SVGSVGElement>) => {
    e.stopPropagation()
    if (suppressClick.current) { suppressClick.current = false; return } // a drag ended here, not a click
    const r = e.currentTarget.getBoundingClientRect()
    const p = groundPointAt(box, r.width, r.height, e.clientX - r.left, e.clientY - r.top)
    if (p) onPoint(p)
  }
  // a press on a hero point after the first: drag it on the map (the click it would also be is suppressed)
  const pointDown = (i: number) => (e: ReactPointerEvent<SVGCircleElement>) => {
    if (!onPointDrag || i === 0) return
    e.stopPropagation()
    const svg = e.currentTarget.ownerSVGElement!
    const start = { x: e.clientX, y: e.clientY }
    let moved = false
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_PX) return
      moved = true
      const r = svg.getBoundingClientRect()
      const p = groundPointAt(box, r.width, r.height, ev.clientX - r.left, ev.clientY - r.top)
      if (p) onPointDrag(i, p)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (moved) suppressClick.current = true
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const flat = plan.flat
  const [cx, , cz] = KIT_MASTER_POSITION, [tx, , tz] = KIT_MASTER_TARGET
  const look = Math.atan2(tx - cx, tz - cz)
  const fan = (a: number) => `${cx + Math.sin(look + a) * 6},${cz + Math.cos(look + a) * 6}`
  const marks = new Map<number, string>()
  for (const a of actions) if (a.point >= 0) marks.set(a.point, (marks.get(a.point) ?? '') + ACTION_MARK[a.kind])
  return (
    <svg className="bl-top" data-testid="blocking-top-view" viewBox={`${x0} ${z0} ${w} ${h}`} preserveAspectRatio="xMidYMid meet" onClick={click}
      style={{ aspectRatio: `${w} / ${h}` }}>
      <rect x={x0} y={z0} width={w} height={h} className="bl-top-ground" />
      {flat && <rect x={flat[0]} y={flat[1]} width={flat[2] - flat[0]} height={flat[3] - flat[1]} className="bl-top-flat"><title>flat ground (the walking corridor)</title></rect>}
      {plan.kit.map((k, i) => (
        <circle key={i} cx={k.at[0]} cy={k.at[1]} r={0.6 * (k.scale ?? 1)} className={hits.includes(i) ? 'bl-top-piece bl-top-hit' : 'bl-top-piece'}
          data-testid={hits.includes(i) ? `blocking-hit-${i}` : undefined}><title>{k.kind}</title></circle>
      ))}
      <PieceDragLayer plan={plan} {...layer} />
      {children}
      <polygon points={`${cx},${cz} ${fan(-0.4)} ${fan(0.4)}`} className="bl-top-camera"><title>master camera</title></polygon>
      {extras.map((e, n) => (
        <g key={`x${n}`} className={drawingExtra === n ? 'bl-top-extra bl-top-drawing' : 'bl-top-extra'} data-testid={`blocking-extra-path-${n}`}>
          {e.stand && e.path[0] && (e.face ?? heroStart) && <line className="bl-top-face" x1={e.path[0][0]} y1={e.path[0][1]} x2={(e.face ?? heroStart)![0]} y2={(e.face ?? heroStart)![1]} />}
          {e.path.length > 1 && <polyline points={e.path.map((p) => p.join(',')).join(' ')} />}
          {e.path.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === 0 ? 0.35 : 0.22} />)}
          {e.path[0] && <text x={e.path[0][0] + 0.5} y={e.path[0][1] - 0.4} className="bl-top-label">{n + 1}</text>}
        </g>
      ))}
      {path.length > 1 && <polyline points={path.map((p) => p.join(',')).join(' ')} className="bl-top-path" />}
      {path.map((p, i) => (
        <g key={`p${i}`}>
          <circle cx={p[0]} cy={p[1]} r={point === i ? 0.6 : 0.35} className={i === 0 ? 'bl-top-start' : point === i ? 'bl-top-selected' : 'bl-top-point'}
            data-testid={`blocking-path-${i}`} onPointerDown={onPointDrag ? pointDown(i) : undefined} />
          {marks.has(i) && <text x={p[0] + 0.6} y={p[1] + 0.3} className="bl-top-label bl-top-action">{marks.get(i)}</text>}
        </g>
      ))}
    </svg>
  )
}

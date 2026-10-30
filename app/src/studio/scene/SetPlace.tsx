// The Set's top view (Track C): the clay's pieces and the subject's mark on one plan, where the user composes the scene from them.
// Every piece (planner shapes, stand-in props, built 3D props, trees) is dragged to move and turned by its knob; the picked one is
// resized, turned a step or removed from the line below, and any kit shape can be added. The grey mark is where the subject starts.
// It embeds Blocking's top view and piece-drag layer; each change is saved free to the world's plan (setPlaceApi.ts), which changes
// the set key, so an approved set goes stale (SetGuards). (set viewport) The plan and the toolbar are apart, so the Set's split view
// shows the plan as its Top pane and the toolbar under every pane, on one shared composing state (useSetPlace).
import { useState } from 'react'
import type { KitItem } from '../../stage3d/contract'
import { KIT_PIECES } from '../../stage3d/kit'
import { MIN_VISIBLE_PIECES, visibleInMaster } from '../../stage3d/planVisible'
import type { KitWorld } from '../../labs/projection/stage3d/kitApi'
import { liftSpots } from '../../stage3d/props/liftSpots'
import { BlockingTopView } from '../stage/panels/blocking/BlockingTopView'
import { LiftHives } from '../stage/panels/blocking/LiftHives'
import { viewBox } from '../stage/panels/blocking/blockingMath'
import '../stage/panels/blocking/blocking.css'
import './setPlace.css'
import { MarkHandle } from './MarkHandle'
import { SCALE_STEP, TURN_STEP, useSetPlace, type SetPlaceState } from './useSetPlace'
import type { PlaceApi } from './setPlaceApi'
import { laneLine, pathHits } from './laneAdvice'

export interface SetPlaceProps {
  /** the kit world on the Set (null = no set yet: nothing is drawn) */
  world: KitWorld | null
  /** the save calls (a test's fakes); default: the world's own routes */
  api?: PlaceApi
}

const KINDS = Object.keys(KIT_PIECES).sort()
/**
 * Which pieces carry their label on the plan: the picked one and every prop always, then the rest only where no label already drawn
 * sits close by (a label on every planner piece crowded a grove into unreadable overlaps). The lab Stage's Top pane reuses this
 * (the merge, step 5), so both top views label the same pieces.
 */
export function labelled(kit: readonly KitItem[], sel: number | null): number[] {
  const order = kit.map((_, i) => i).filter((i) => kit[i].label)
  const rank = (i: number) => (i === sel ? 0 : kit[i].pieceTag?.startsWith('prop:') ? 1 : 2)
  const out: number[] = []
  for (const i of order.sort((a, b) => rank(a) - rank(b))) {
    const [x, z] = kit[i].at
    if (rank(i) < 2 || !out.some((j) => Math.abs(kit[j].at[0] - x) < 16 && Math.abs(kit[j].at[1] - z) < 2.5)) out.push(i) // a label runs about 16 m wide on the plan
  }
  return out
}
/** a label short enough to stay inside the plan beside its piece */
export const clipLabel = (l: string) => (l.length > 28 ? `${l.slice(0, 27).trimEnd()}…` : l)
const nameOf = (kind: string, label?: string) => (label ? `${kind} (${label})` : kind)

/** the composite (the plan with its toolbar under it, on its own state): the Set mounts the two parts apart (SetViews) */
export function SetPlace({ world, api }: SetPlaceProps) {
  const p = useSetPlace(world, api)
  if (!world) return null
  return <section className="sd-place" data-testid="set-place"><SetTopView p={p} /><SetPlaceBar p={p} /></section>
}

/** the plan from above: every piece and the mark, dragged here; the pick and the live poses are the other views' too */
export function SetTopView({ p }: { p: SetPlaceState }) {
  const world = p.world
  if (!world) return null
  const { plan, perf } = world
  const box = viewBox(plan, [perf.path]), mid = (box[0] + box[2]) / 2
  return (
    <BlockingTopView plan={plan} path={perf.path} extras={[]} actions={[]} point={null} hits={pathHits(plan, perf)} drawingExtra={null} onPoint={() => p.select(null)}
      layer={{ world: world.id, onSelect: p.setSel, selected: p.sel, live: p.poses, onDrag: (i, pose) => p.setLive(i, pose), save: p.savePiece }}>
      {labelled(plan.kit, p.sel).map((i) => {
        const [x, z] = p.poseOf(i)?.at ?? plan.kit[i].at, right = x > mid // a piece on the right half has its label to its left, so it stays in the plan
        return <text key={i} x={right ? x - 0.9 : x + 0.9} y={z - 0.8} textAnchor={right ? 'end' : 'start'} className="bl-top-label" pointerEvents="none" data-testid={`set-label-${i}`}>{clipLabel(plan.kit[i].label!)}</text>
      })}
      <LiftHives path={perf.path} actions={perf.actions} kit={plan.kit} />
      <MarkHandle plan={plan} perf={perf} save={p.saveMark} onError={p.setError} live={p.poses.mark ?? null} onDrag={(pose) => p.setLive('mark', pose)}
        onPick={() => p.select('mark')} selected={p.pick === 'mark'} />
    </BlockingTopView>
  )
}

/** the pick's name and what can be done to it, the pick list (the keyboard's way to pick), Put back, Add, the thin-set warning */
export function SetPlaceBar({ p }: { p: SetPlaceState }) {
  const [kind, setKind] = useState('tree')
  const world = p.world
  if (!world) return null
  const { plan, perf } = world
  // the planner's thin-set check (server/planner/finishPlan.ts), said here from the plan as it stands: a warning, never a block; a hive a
  // lift brings (none of the set's there) is in the picture too, so it counts
  const own = liftSpots(perf.path, perf.actions, plan.kit).filter((s) => s.piece < 0).map((s) => ({ kind: 'hive', at: s.at }))
  const seen = visibleInMaster({ kit: [...plan.kit, ...own] }).length
  const hit = p.sel !== null && pathHits(plan, perf).includes(p.sel), lane = laneLine(p.item, p.sel, plan, hit && p.sel !== null ? [p.sel] : [])
  const thin = seen < MIN_VISIBLE_PIECES && plan.sky?.look !== 'interior'
  return (
    <>
      {thin && <p className="st-warn" data-testid="set-thin">This set is thin: only {seen} {seen === 1 ? 'piece is' : 'pieces are'} in the master view. A place named as many things (an orchard, a market) should have more. Add pieces below, or approve it as it is.</p>}
      <div className="sd-place-bar" data-testid="set-place-bar">
        <label className="sd-place-pick">Pick{' '}
          <select value={p.pick === null ? '' : String(p.pick)} data-testid="place-pick" onChange={(e) => p.select(e.target.value === '' ? null : e.target.value === 'mark' ? 'mark' : Number(e.target.value))}>
            <option value="">nothing</option>
            <option value="mark">the subject's mark</option>
            {plan.kit.map((it, i) => <option key={i} value={i}>{`${i + 1}. ${clipLabel(nameOf(it.kind, it.label))}`}</option>)}
          </select>
        </label>
        {p.item ? (
          <>
            <b className="sd-place-name">{nameOf(p.item.kind, p.item.label)}</b>
            <button type="button" data-testid="place-smaller" onClick={() => void p.scaleBy(1 / SCALE_STEP)}>Smaller</button>
            <button type="button" data-testid="place-larger" onClick={() => void p.scaleBy(SCALE_STEP)}>Larger</button>
            <span className="st-muted" data-testid="place-scale">{`${Math.round((p.item.scale ?? 1) * 100)}%`}</span>
            <button type="button" data-testid="place-turn-left" onClick={() => void p.turnBy(-TURN_STEP)}>Turn left</button>
            <button type="button" data-testid="place-turn-right" onClick={() => void p.turnBy(TURN_STEP)}>Turn right</button>
            <button type="button" data-testid="place-remove" onClick={() => void p.remove()}>Remove</button>
          </>
        ) : p.pick === 'mark' ? (
          <>
            <b className="sd-place-name">The subject's mark</b>
            <button type="button" data-testid="place-turn-left" onClick={() => void p.turnBy(-TURN_STEP)}>Turn left</button>
            <button type="button" data-testid="place-turn-right" onClick={() => void p.turnBy(TURN_STEP)}>Turn right</button>
          </>
        ) : <span className="st-muted">No piece picked.</span>}
        {p.removed && <button type="button" data-testid="place-undo" onClick={() => void p.undo()}>{`Put back ${p.removed.kind}`}</button>}
        <label className="sd-place-add">Add a piece{' '}
          <select value={kind} onChange={(e) => setKind(e.target.value)} data-testid="place-kind">{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>{' '}
          <button type="button" data-testid="place-add" onClick={() => void p.add(kind)}>Add</button>
        </label>
      </div>
      {lane && <p className={hit ? 'st-warn' : 'st-muted'} data-testid="set-lane">{lane}</p>}
      {p.error && <p className="st-warn" role="alert" data-testid="place-error">{p.error}</p>}
    </>
  )
}

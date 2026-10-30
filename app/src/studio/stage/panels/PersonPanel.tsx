// The Person panel (merge step 6c; the Stage simplification; the object card wave): the picked person — the 3D performer on the
// mark, one selectable figure. Where she stands: drag her in the view, Turn left / Turn right (the plain angle control), Face the
// <prop> — one press per piece the owner placed (a kit piece with its own pieceTag: the planner's generic pieces, crates and
// barrels, are never offered, hide-set-build). What she does: one action in plain words (Describe a move: the motion computer
// makes it, Play here auditions it, Use this one places it at the mark), listed with its seconds and a ×; Clear her action puts her
// back to standing. Where she goes: one Walk to a spot (WalkTo.tsx: click the ground, pick Slow walk / Walk / Run; a made move
// then happens at the spot). Every change saves itself (the mark through the Set's mark route, the walk and the action through
// Blocking's live-saving draft); no path is ever drawn point by point here. DOM only: nothing here enters the scene. Who plays
// them and their look moved into the one object card (PersonCard: 'Their look' reopens it); nothing about a single person lives
// here any more. (hide-more-creatures) More creatures is switched off: this panel has no creature controls.
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { markOf, yawToward } from '../../../stage3d/mark'
import { TURN_STEP, type SetPlaceState } from '../../scene/useSetPlace'
import { DescribeMoveSlot } from './blocking/describeMoveSlot'
import type { Blocking } from './blocking/useBlocking'
import { usePerformerWords } from '../pronoun'
import { TakeWalkBanner } from './TakeWalkBanner'
import { WalkTo } from './WalkTo'
import { WhoPlays } from './WhoPlays'

export interface PersonPanelProps {
  lab: ProjectionLabState
  /** the blocking draft this panel edits (one instance per Stage screen, owned by the panel host) */
  b: Blocking
  /** the one selection's composing state (the mark's turn and facing save through it) */
  place: SetPlaceState
  /** the object card again, after the owner closed it (a click on the person opens it by itself) */
  onOpenCard?: () => void
}

export function PersonPanel({ lab, b, place, onOpenCard }: PersonPanelProps) {
  const world = lab.kit.world
  const w = usePerformerWords(world?.id, world?.perf.castId)
  if (!world) {
    return <p className="st-field-hint" data-testid="person-none">{lab.kit.error ?? (lab.kit.id ? 'Loading the set…' : 'The person works on a kit world: pick one as the source.')}</p>
  }
  const pose = place.poseOf('mark') ?? (() => { const m = markOf(world.plan); return { at: m.at as [number, number], yaw: m.yawDeg } })()
  const props = world.plan.kit.filter((k) => k.pieceTag).slice(0, 3) // only what the owner placed: a piece with its own pieceTag
  const face = (at: [number, number]) => void place.drop('mark', { at: pose.at, yaw: yawToward(pose.at, at) })
  const turn = (deg: number) => void place.drop('mark', { at: pose.at, yaw: ((((pose.yaw + deg + 180) % 360) + 360) % 360) - 180 })
  const acts = b.draft.actions
  const clear = acts.length > 0 || b.draft.path.length > 1 || b.draft.extras.length > 0
  return (
    <div className="st-scene" data-testid="person-panel">
      <TakeWalkBanner lab={lab} />
      <WhoPlays castId={world.perf.castId} onOpenCard={onOpenCard} />
      <section className="st-scene-card">
        <h2>{w.stands}</h2>
        <span className="st-field-hint">{w.dragHint}</span>
        <div className="sd-act">
          <button type="button" data-testid="person-turn-left" onClick={() => turn(-TURN_STEP)}>Turn left</button>
          <button type="button" data-testid="person-turn-right" onClick={() => turn(TURN_STEP)}>Turn right</button>
          {props.map((k, i) => (
            <button key={i} type="button" data-testid={`person-face-${i}`} onClick={() => face(k.at)}>Face the {k.label?.trim() || k.kind}</button>
          ))}
        </div>
        {place.error && <p className="st-warn" role="alert" data-testid="person-place-error">{place.error}</p>}
      </section>
      <WalkTo lab={lab} b={b} />
      <section className="st-scene-card" data-testid="person-action">
        <h2>{w.does}</h2>
        {acts.map((a, i) => (
          <div key={i} className="bl-item" data-testid={`person-action-${i}`}>
            <span className="bl-item-name">{a.kind === 'move' ? a.words || 'made move' : a.kind}</span>
            {a.seconds !== undefined && <span className="st-field-hint">{a.seconds} s</span>}
            <button type="button" className="st-btn bl-x" onClick={() => b.actions.remove(i)} aria-label="Remove action">×</button>
          </div>
        ))}
        {acts.length === 0 && <DescribeMoveSlot b={b} point={Math.max(b.draft.path.length - 1, 0)} inline />}
        {clear && <button type="button" className="st-btn" data-testid="person-clear" disabled={b.busy} onClick={b.hero.clear}>{w.clear}</button>}
        {b.error && <p className="bl-error" data-testid="person-error">{b.error}</p>}
      </section>
    </div>
  )
}

// The Stage's Walk to a spot (the one walk control back on the simplified Stage; W3-E2: the viewport right-click menu's Walk to a
// spot / Slow walk / Run arm this same tool, Hold here is its Stay put): press it, click the ground in any view, and she
// walks from her mark to that spot in the shot. Slow walk / Walk / Run set the pace; Stay put takes the walk away. While the pick
// is armed it shows it: a crosshair cursor and a rubber band from her place to the spot under the mouse, in the Free view and the
// Top View (walk-tool-hot-state). It writes the same live-saving blocking draft the rest of the Person panel does (path = the mark
// and the spot, pace, gait), and the motion compiler, the shot length's padding and the take are untouched. Says how far she can
// get in the shot's seconds. DOM only.
import { useEffect, useState } from 'react'
import { Raycaster, Vector2 } from 'three'
import { markOf } from '../../../stage3d/mark'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { setGroundDrawing } from '../groundDrawing'
import { setWalkHot, setWalkMarks } from '../walkMarks'
import { groundHit, useGroundClick } from './blocking/groundClick'
import { pathLength, type Pt } from './blocking/blockingMath'
import type { Blocking } from './blocking/useBlocking'
import { usePerformerWords } from '../pronoun'
import { setWalkArm } from '../walkArm'

/** Slow walk / Walk / Run: the pace and gait they set, and about how many metres a second the figure covers (measured with the
 *  clip library over a straight 2-14 m path: a 6 m walk takes 5.9 s at Walk, 7.9 s at Slow walk, 1.9 s at Run) */
export const SPEEDS = [
  { id: 'slow', label: 'Slow walk', pace: 0.6, gait: 'walk' as const, mps: 0.76 },
  { id: 'walk', label: 'Walk', pace: 0.8, gait: 'walk' as const, mps: 1.0 },
  { id: 'run', label: 'Run', pace: 1, gait: 'run' as const, mps: 3.1 },
]
/** a spot nearer than this to her start is not a walk */
export const MIN_WALK_M = 0.5
/** seconds past the take she may need before it is worth saying */
const OVER_S = 0.5

const speedOf = (pace: number, gait: string) => SPEEDS.find((s) => s.gait === gait && Math.abs(s.pace - pace) < 0.01) ?? null

/** mounted only while the pick is armed: the next click on the ground (any view) is the spot; Esc cancels. With `from` (the walk
 *  tool), the cursor turns crosshair and a rubber band runs from `from` to the spot under the mouse, cleared when this unmounts. */
export function SpotPicker({ lab, from, onSpot, onCancel }: { lab: ProjectionLabState; from?: Pt; onSpot: (p: Pt) => void; onCancel: () => void }) {
  useGroundClick(lab.stage, onSpot)
  // while armed, an empty-ground press is the spot's, not the Add menu's or a let-go (useStagePick reads this)
  useEffect(() => { setGroundDrawing(true); return () => setGroundDrawing(false) }, [])
  // the hot pick's feedback (walk-tool-hot-state): the crosshair cursor and the band, tracked on pointermove and drawn by the
  // overlay (walkOverlay.ts) in every pane; the ray goes through the pane under the cursor, so the Free view and the Top View
  // both work. The band clears when the tool ends or Esc cancels (this unmounts).
  useEffect(() => {
    const stage = lab.stage
    const canvas = stage?.renderer?.domElement
    if (!canvas) return
    const parent = canvas.parentElement
    const groundAt = lab.kit?.layer?.groundAt ?? (() => 0)
    const move = (e: PointerEvent) => {
      if (!stage) return
      const r = canvas.getBoundingClientRect()
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { setWalkHot(from ? { from, to: null } : null); return }
      const cast = stage.panes?.rayAt(e.clientX, e.clientY)
      let p: Pt | null = null
      if (cast) p = groundHit(cast.ray.origin, cast.ray.direction, groundAt)
      else {
        const ndc = new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
        const ray = new Raycaster()
        ray.setFromCamera(ndc, stage.view)
        p = groundHit(ray.ray.origin, ray.ray.direction, groundAt)
      }
      setWalkHot(from ? { from, to: p } : null)
    }
    parent?.addEventListener('pointermove', move, true)
    canvas.style.cursor = 'crosshair'
    return () => {
      parent?.removeEventListener('pointermove', move, true)
      canvas.style.cursor = ''
      setWalkHot(null)
    }
  }, [lab, from])
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onCancel])
  return null
}

export function WalkTo({ lab, b }: { lab: ProjectionLabState; b: Blocking }) {
  const [armed, setArmed] = useState(false)
  const [near, setNear] = useState(false)
  const world = b.world
  const w = usePerformerWords(world?.id, world?.perf.castId)
  // the walk on the viewport (walkOverlay.ts): her start, the path and the spot, while this panel is up (the person is picked)
  const shownPath = world ? b.draft.path : null
  const pathKey = JSON.stringify(shownPath)
  useEffect(() => { setWalkMarks(shownPath); return () => setWalkMarks(null) }, [pathKey]) // eslint-disable-line react-hooks/exhaustive-deps -- the key is the path
  // the viewport right-click menu's walk presses arm THIS tool (walkArm.ts): the same spot picker, the same overlay, the same
  // save — the menu never walks her by itself. Hold here is Stay put: she stays where she is.
  useEffect(() => {
    setWalkArm({
      arm: (speed) => {
        const s = SPEEDS.find((x) => x.id === speed) ?? SPEEDS[1]
        setNear(false)
        setArmed(true)
        b.hero.setSpeed(s.pace, s.gait)
      },
      stay: () => { setArmed(false); b.hero.stand() },
    })
    return () => setWalkArm(null)
  }, [b])
  if (!world) return null
  const path = b.draft.path
  const walking = path.length > 1
  const metres = walking ? pathLength(path) : 0
  const mark = markOf(world.plan).at
  const speed = speedOf(b.draft.pace, b.draft.gait)
  const shot = world.perf.shotSeconds ?? null // the scene's: a walk set here is for the next take
  // the time she needs, from the measured speed (the live performer's duration also holds the shot's closing idle, so it cannot say this)
  const needs = walking && speed ? metres / speed.mps : null
  const over = needs !== null && shot !== null && needs > shot + OVER_S
    ? `${w.needs} about ${Math.ceil(needs)} s to get there and the take is ${shot} s: pick a closer spot, Run, or a longer take. A take keeps the first ${shot} s.` : null
  const reach = shot !== null && speed ? Math.floor(shot * speed.mps) : null
  const spot = (p: Pt) => {
    setArmed(false)
    if (Math.hypot(p[0] - mark[0], p[1] - mark[1]) < MIN_WALK_M) { setNear(true); return }
    setNear(false)
    b.hero.walkTo(p)
  }
  return (
    <section className="st-scene-card" data-testid="person-walk">
      <h2>{w.goes}</h2>
      <div className="sd-act">
        <button type="button" className={armed ? 'st-btn bl-on' : 'st-btn'} data-testid="walk-to" disabled={b.busy}
          onClick={() => { setNear(false); setArmed((a) => !a) }}>{armed ? 'Cancel' : walking ? 'Pick another spot' : 'Walk to a spot'}</button>
        {walking && <button type="button" className="st-btn" data-testid="walk-stay" disabled={b.busy} onClick={() => { setArmed(false); b.hero.stand() }}>Stay put</button>}
      </div>
      {armed && <>
        <SpotPicker lab={lab} from={path.length ? path[path.length - 1] : mark} onSpot={spot} onCancel={() => setArmed(false)} />
        <span className="st-field-hint" data-testid="walk-armed">Click the spot on the ground, in any view. Esc to cancel.</span>
      </>}
      {near && <span className="st-field-hint" data-testid="walk-near">That is right where {w.starts}: pick a spot farther away.</span>}
      {walking && <>
        <div className="sd-act" data-testid="walk-speed">
          {SPEEDS.map((s) => (
            <button key={s.id} type="button" className={s === speed ? 'st-btn bl-on' : 'st-btn'} aria-pressed={s === speed} data-testid={`walk-speed-${s.id}`}
              onClick={() => b.hero.setSpeed(s.pace, s.gait)}>{s.label}</button>
          ))}
        </div>
        <span className="st-field-hint" data-testid="walk-line">
          {w.walks} {metres.toFixed(1)} m to the spot{reach !== null ? `; in a ${shot} s take ${w.covers} about ${reach} m at this pace.` : '.'}
        </span>
      </>}
      {over && <p className="st-warn" data-testid="walk-over">{over}</p>}
    </section>
  )
}

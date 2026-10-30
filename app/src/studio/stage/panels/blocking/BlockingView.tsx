// Blocking's view on one kit world — the Shoot screen's Blocking mode and the Stage's Person panel share it (merge step 6c);
// the draft (b) is the caller's, so the Person and At-this-point panels edit the same live-saving draft. The top view, then
// the hero (stands at the mark or walks a path, pace, gait, who plays him, actions), the extras and the live-save status.
// Free throughout; every edit saves itself, debounced, through the performance route and the viewport rebuilds the performers;
// a refusal keeps the draft and says why. Drawing ends on Done, on Esc, or on a click on the panel away from the map and the
// controls. `onPointSelected` (the Person panel) additionally hands a clicked path point to the At-this-point panel.
import { useEffect, useState, type MouseEvent } from 'react'
import type { Stage } from '../../../../labs/projection/engine/Stage'
import type { KitWorld } from '../../../../labs/projection/stage3d/kitApi'
import { Ask, Select } from '../../../ui'
import { ActionList } from './ActionList'
import { BlockingTopView } from './BlockingTopView'
import { pathLength, type Pt } from './blockingMath'
import { tagOptions } from './bibleTags'
import { ExtrasList } from './ExtrasList'
import { LiftHives } from './LiftHives'
import { MarkFacing } from '../../../scene/MarkFacing'
import { MotionHealthLine } from '../../moves'
import { setGroundDrawing } from '../../groundDrawing'
import { useGroundClick } from './groundClick'
import { SAVED_LINE, type Blocking, type Target } from './useBlocking'

const PACES = ['0.6', '0.8', '1', '1.2'] as const
const STAND_LINE = 'Stands at the mark, facing the way the mark faces.'

function modeLine(target: Target, extras: KitWorld['perf']['extras'] = []): string {
  switch (target.kind) {
    case 'hero': return 'Drawing the path of the hero: click the ground in the 3D view or on the map to add points. Esc or Done to finish.'
    case 'extra': return `${extras[target.n]?.stand ? `Placing extra ${target.n + 1}` : `Drawing extra ${target.n + 1}'s path`}: click the ground or the map. Esc or Done to finish.`
    case 'face': return `Click the ground extra ${target.n + 1} faces. Esc to cancel.`
    case 'look': return `Click the ground extra ${target.n + 1} looks at. Esc to cancel.`
    default: return 'Click a point on the hero path (in the 3D view or on the map) to select it.'
  }
}

/** the hero point within 1.5 m of a ground click, if any — the same nearest pick the draft's select mode makes */
function nearestPoint(path: Pt[], p: Pt): number | null {
  let best = -1, d = 1.5
  path.forEach((q, i) => { const k = Math.hypot(q[0] - p[0], q[1] - p[1]); if (k < d) { best = i; d = k } })
  return best >= 0 ? best : null
}

export function BlockingView({ world, stage, b, onPointSelected }: { world: KitWorld; stage?: Stage | null; b: Blocking; onPointSelected?: (n: number | null) => void }) {
  const click = (p: Pt) => {
    if (onPointSelected && b.target.kind === 'select') onPointSelected(nearestPoint(b.draft.path, p))
    b.click(p)
  }
  useGroundClick(stage, click) // the 3D ground takes the same clicks as the map
  const { draft, target } = b
  const [asking, setAsking] = useState<'new' | 'stand' | null>(null)
  const cast = tagOptions(b.bible, 'cast')
  const castValue = draft.castId || b.saved.castId || ''
  const castOpts = [...(castValue ? [] : [{ value: '', label: 'choose a cast tag' }]), ...(castValue && !cast.some((c) => c.cardId === castValue) ? [{ value: castValue, label: `${castValue} (no tag in the scene sheet)` }] : []),
    ...cast.map((c) => ({ value: c.cardId!, label: c.label }))]
  const drawingHero = target.kind === 'hero'
  const drawing = target.kind !== 'select'
  const stop = () => b.setTarget({ kind: 'select' })
  const hits = [...new Set([...b.through.hero, ...b.through.extras.flat()])]

  // Esc ends drawing wherever the focus is; the listener lives only while a draw is on, so Esc means nothing new otherwise
  useEffect(() => {
    if (!drawing) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') stop() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawing]) // eslint-disable-line react-hooks/exhaustive-deps
  // L3: while a draw is on, empty-ground clicks belong to Blocking (path points), not the Add mark (useStagePick reads this)
  useEffect(() => { setGroundDrawing(drawing); return () => setGroundDrawing(false) }, [drawing])
  // a click on the panel itself (not the map, not a control) ends drawing too
  const panelClick = (e: MouseEvent) => {
    if (drawing && !(e.target as Element).closest('svg, button, input, select, label, textarea, a')) stop()
  }
  const mode = b.standing && !drawingHero ? 'stand' : 'walk'

  return (
    <section className="bl-root" data-testid="blocking-panel" onClick={panelClick}
      onKeyDown={(e) => { if (e.key === 'Escape' && drawing) stop(); e.stopPropagation() }}>
      <BlockingTopView plan={world.plan} path={draft.path} extras={draft.extras} actions={draft.actions} point={b.point} hits={hits}
        drawingExtra={target.kind === 'extra' ? target.n : null} heroStart={draft.path[0] ?? null} onPoint={click} onPointDrag={b.hero.movePoint}>
        <LiftHives path={draft.path} actions={b.plan.actions} kit={world.plan.kit} />
        <MarkFacing plan={world.plan} perf={b.plan} />
      </BlockingTopView>
      <div className="bl-row bl-save" data-testid="blocking-header">
        <MotionHealthLine />
      </div>
      <span className="st-field-hint" data-testid="blocking-mode-line">{modeLine(target, draft.extras)}</span>

      <div className="bl-group" data-testid="blocking-hero">
        <div className="bl-head">Hero (the performer)</div>
        {asking === 'stand'
          ? <Ask label="Stand at the mark" yes="Stand" no="Keep the walk" testId="blocking-stand-ask" onYes={() => { setAsking(null); b.hero.stand() }} onNo={() => setAsking(null)}>
            Drop the path after the mark, and the actions on it?</Ask>
          : <Select label="Does" value={mode} options={[{ value: 'stand', label: 'Stands at the mark' }, { value: 'walk', label: 'Walks a path' }]}
            onChange={(v) => (v === 'walk' ? b.hero.walk() : draft.path.length > 1 ? setAsking('stand') : b.hero.stand())} testId="blocking-hero-mode" />}
        <div className="bl-row">
          {asking === 'new'
            ? <Ask label="Start a new path" yes="Clear it" no="Keep it" testId="blocking-path-ask" onYes={() => { setAsking(null); b.hero.newPath() }} onNo={() => setAsking(null)}>
              Clear the path and its stops?</Ask>
            : <button type="button" className="st-btn" disabled={b.busy} data-testid="blocking-path-new"
              onClick={() => (draft.path.length > 1 || draft.actions.length ? setAsking('new') : b.hero.newPath())}>New path</button>}
          <button type="button" className={drawingHero ? 'st-btn bl-on' : 'st-btn'} onClick={() => (drawingHero ? stop() : b.hero.walk())}
            disabled={b.busy} data-testid="blocking-path-draw">{drawingHero ? 'Done' : 'Draw the path'}</button>
          <button type="button" className="st-btn" onClick={b.hero.undo} disabled={b.busy || draft.path.length <= 1} data-testid="blocking-path-undo">Undo point</button>
        </div>
        <span className="st-field-hint" data-testid="blocking-path-line">
          {draft.path.length} point{draft.path.length === 1 ? '' : 's'} · {draft.path.length === 1 ? STAND_LINE : `${pathLength(draft.path).toFixed(1)} m`}
        </span>
        {b.through.hero.length > 0 && (
          <span className="bl-warn" data-testid="blocking-through-warning">
            The hero path runs through {b.through.hero.map((i) => world.plan.kit[i].kind).join(', ')}: the performer will walk through it.
          </span>
        )}
        <div className="bl-row">
          <Select label="Pace" value={String(draft.pace)} options={[...new Set([...PACES, String(draft.pace)])].map((p) => ({ value: p, label: `${p}×` }))}
            onChange={(v) => b.hero.setPace(Number(v))} testId="blocking-pace" />
          <Select label="Gait" value={draft.gait} options={[{ value: 'walk', label: 'walk' }, { value: 'run', label: 'run' }]} onChange={b.hero.setGait} testId="blocking-gait" />
        </div>
        {cast.length > 0 || castValue
          ? <Select label="Played by" value={castValue} options={castOpts} onChange={b.hero.setCast}
            hint="A cast tag from the scene sheet; the performer's face in the stills comes from its card." testId="blocking-cast" />
          : <span className="st-field-hint" data-testid="blocking-cast-none">No cast tags in the scene sheet yet: make a person from The subject's panel.</span>}
      </div>

      <ActionList b={b} />
      <ExtrasList b={b} />

      <div className="bl-row bl-save" data-testid="blocking-status">
        {b.blocked && <span className="bl-warn" data-testid="blocking-save-reason">{b.blocked}</span>}
        {b.error && <p className="bl-error" data-testid="blocking-error">{b.error}</p>}
        {!b.changed && !b.busy && !b.error && <span className="st-field-hint" data-testid="blocking-saved">{SAVED_LINE}</span>}
      </div>
      {b.note && <span className="st-field-hint" data-testid="blocking-note">{b.note}</span>}
    </section>
  )
}

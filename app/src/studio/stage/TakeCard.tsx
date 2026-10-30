// The take card beside the Prompt box (owner 10-29): it follows the take the Prompt box names ("Take · …"), so a take switch changes
// it at once. No first frame yet: Draw the first frame, its Options count and price (DrawPress, the words it sends one click away).
// Above it, one muted line of what the take keeps (Walk: stands, 6 s, own set) and, when the scene moved on, "Lock again to keep its walk".
// A first frame: a small picture of the version in use, "First frame ✓" (or "carried over" for one carried from the take it was
// re-locked from); a click opens the first-frame window. Beside it, Draw again with its price: the window's Draw another press. A render of this take: a second small picture, "Clip · N s ▶", which opens
// the first-frame window on its Clip. While a draw, an edit or a render runs the card says so. Nothing here spends except the draw press it shows.
import { useEffect, useRef } from 'react'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { framePending, PENDING_FRAME, setFrameView, showFrameClip } from '../shoot/firstFrameView'
import { useHeroPublished } from '../shoot/heroPublished'
import { keepsSummary, relockWords } from '../shoot/takeKeeps'
import { PriceButton } from '../ui'
import { DrawPress } from './DrawPress'
import { PIECE_BUILDING } from './pieceBuilding'
import { useFrameEditPublished } from './frameEditStore'
import { useStageRender } from './useStageRender'
import { useTakeKeeps } from './useTakeKeeps'
import './takeCard.css'

/** what the first-frame picture says under it */
export const frameLabel = (carried: boolean) => (carried ? 'First frame ✓ · carried over' : 'First frame ✓')
/** what the clip picture says under it: its length in seconds, one decimal when it has one */
export const clipLabel = (frames: number, fps = 24) => `Clip · ${Math.round((frames / fps) * 10) / 10} s ▶`

/** `takeId`: the take the Prompt box names; null = none on show (a take being filmed, or none locked) */
export function TakeCard({ lab, takeId }: { lab: ProjectionLabState; takeId: string | null }) {
  const pub = useHeroPublished()
  const edit = useFrameEditPublished()
  const r = useStageRender(lab)
  const o = pub?.overlay ?? null
  const press = pub?.press ?? null
  const mine = !!takeId && edit?.takeId === takeId
  const versions = mine ? edit!.versions : []
  // the version in use, else (two fresh ones, none picked yet) the one the window would open on
  const frame = mine ? edit!.inUse ?? (o && !o.still.stale ? versions.find((v) => v.id === o.still.id && !v.stale) ?? null : null) : null
  const own = useTakeKeeps(lab, takeId)
  useOpenOnLanding(takeId, o?.still.id ?? null, !!pub?.press?.drawing, !frame)
  if (!takeId) return <div className="st-takecard st-takecard-empty" data-testid="take-card"><p className="st-muted">Lock a take to draw its first frame.</p></div>
  const open = () => { if (!o || !frame) return; edit?.onShow(frame.id); setFrameView(o.still.id, 'still') }
  const openClip = () => { if (!o || !frame) return; edit?.onShow(frame.id); showFrameClip(o.still.id) }
  const clip = r.clip
  const keeps = own ? keepsSummary(own.take, own.keeps) : ''
  const relock = own ? relockWords(own.keeps) : null
  return (
    <div className="st-takecard" data-testid="take-card" data-take={takeId}>
      {keeps && <p className="st-muted" data-testid="take-card-keeps" title="What this take keeps of its own, so a change to the scene never reaches it">{keeps}</p>}
      {relock && <p className="st-warn" data-testid="take-card-relock" title="The scene has moved on from this take's walk or set. Its first frame and renders still open.">{relock}</p>}
      {frame ? (
        <div className="st-takecard-pics">
          <button type="button" className="st-takecard-pic" data-testid="take-card-frame" title="Open the first frame: edit it, pick a version, render the clip" onClick={open}>
            <img src={frame.png} alt="The first frame in use" width={112} height={63} />
            <span data-testid="take-card-frame-label">{edit!.inUse ? frameLabel(!!frame.carriedFrom) : 'First frame · pick one'}</span>
          </button>
          {clip && (
            <button type="button" className="st-takecard-pic" data-testid="take-card-clip" title="Open the clip in the first-frame window" onClick={openClip}>
              <video key={clip.id} src={clip.finished ?? clip.raw ?? undefined} muted playsInline preload="metadata" width={112} height={63} />
              <span>{clipLabel(clip.frames ?? 0)}</span>
            </button>
          )}
          {press && !press.drawing && (
            <PriceButton verb="Draw again" price={press.price} testId="take-card-draw-again" disabled={press.disabled || r.building}
              title={r.building ? PIECE_BUILDING : press.disabled ? press.title : 'Draw another version of this first frame (the same draw as Draw another in the window)'} onClick={press.onPress} />
          )}
          {press?.setBehind && !press.drawing && <p className="st-warn st-takecard-run" data-testid="take-card-set-behind">{press.setBehind}</p>}
          {r.running && <span className="st-muted st-takecard-run" role="status" data-testid="take-card-rendering">Rendering…</span>}
          {pub?.press?.drawing && <span className="st-muted st-takecard-run" role="status" data-testid="take-card-drawing">Drawing another…</span>}
          {mine && edit!.editing && <span className="st-muted st-takecard-run" role="status" data-testid="take-card-editing">Editing the frame…</span>}
        </div>
      ) : versions.some((v) => !v.stale) && !pub?.press?.drawing ? (
        <p className="st-muted" data-testid="take-card-reading">Reading the first frame…</p>
      ) : (
        <DrawPress verb="Draw the first frame" primary building={r.building} worldId={lab.kit?.id ?? null} pop />
      )}
    </div>
  )
}

/** a draw of this take that lands opens the window on it: the new frame is what the owner wants to look at next. (owner 10-29) The
 *  first frame's draw opens the window the moment it is pressed, in its working state (the frames update, then the draw), and the
 *  frame that lands takes that window's place */
function useOpenOnLanding(takeId: string | null, frameId: string | null, drawing: boolean, first: boolean) {
  const was = useRef({ takeId, drawing })
  useEffect(() => {
    if (!was.current.drawing && drawing && first && was.current.takeId === takeId) setFrameView(PENDING_FRAME, 'still')
    else if (frameId && (framePending() || (was.current.drawing && !drawing && was.current.takeId === takeId))) setFrameView(frameId, 'still')
    was.current = { takeId, drawing }
  }, [takeId, drawing, frameId, first])
}

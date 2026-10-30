// The first frame's paid draw on the Stage (owner 10-29): the take card's "Draw the first frame" and the first-frame window's "Draw
// another" are this one press. The still block owns it (HeroStillBlock publishes its closure, price and gate, heroPublished.ts):
// the Options count (1 or 2), the price, the running pill, and every guard line the steps block had — a 3D piece building, the gate,
// no person in the shot, a failure, a paid drawing owed (Recover, never a second draw), a drawing stopped before its finish (Finish
// the frame). The draw-mode row and the same-look switch show only when the scene has an approved frame to take from. Under the
// press, "What will be sent": every job the press sends with its exact words, from the server's own press preview.
import { GenCount } from '../scene/GuidedStage'
import '../scene/guided.css'
import { PriceButton, RunPill, STILL_ESTIMATE } from '../ui'
import { useHeroPublished } from '../shoot/heroPublished'
import { isSetRefusal } from './useAutoReapprove'
import { PIECE_BUILDING } from './pieceBuilding'
import { DrawModeRow, DrawNudge } from './panels/DrawModeRow'
import { SetRefusal } from './panels/SetRefusal'
import { SentJobs } from './SentJobs'
import { useCurrentTakeId } from '../shoot/currentTake'

/** (owner 10-30) the draw-mode row and the same-look switch are untested: hidden, so every draw goes from the words with the card's
 *  look; the code stays for later */
const LOOK_CONTROLS = false

export function DrawPress({ verb, primary, building, worldId, pop = false, nudge = true }: { verb: string; primary: boolean; building: boolean; worldId: string | null
  /** the folded "What will be sent" opens as a pop-up (the compact take card); else it opens in place under the press */
  pop?: boolean
  /** the scene-wide "draw and pick one frame first" nudge (the take card's; the window already has a frame) */
  nudge?: boolean }) {
  const pub = useHeroPublished()
  const takeId = useCurrentTakeId()
  const press = pub?.press ?? null
  const o = pub?.overlay ?? null
  if (!press) return null
  const owed = !!press.onRecover || !!press.finish
  const jobs = pub?.prompt?.preview?.sent
  const sent = <SentJobs jobs={jobs} testId="draw-sent" takeId={takeId} keys={jobs?.map((j) => j.edit)} />
  return (
    <div className="st-drawpress" data-testid="draw-press">
      {press.drawing
        ? <RunPill label={press.phase ?? 'The first frame is being drawn…'} since={press.since} estimate={STILL_ESTIMATE} price={press.price} testId="hero-phase" />
        : <>
          {LOOK_CONTROLS && press.drawMode && <DrawModeRow model={press.drawMode} overlay={o} />}
          {nudge && press.drawNudge && !o?.approved && <DrawNudge />}
          <div className="st-drawpress-row">
            <PriceButton primary={primary && !press.disabled && !owed && !building} verb={verb} price={press.price} testId="hero-render"
              disabled={press.disabled || building} title={building ? PIECE_BUILDING : press.title} onClick={press.onPress} />
            {press.onStills && <GenCount value={press.stills ?? 1} onChange={press.onStills} testId="hero-count" min={1} max={2} />}
          </div>
          {LOOK_CONTROLS && press.sameLook && (
            <p className="st-muted" data-testid="hero-same-look">{press.sameLook.on ? 'Same look as an earlier frame: its clothes and seed.' : "Clothes from the person's card."}{' '}
              <button type="button" className="st-link" data-testid="hero-same-look-toggle" onClick={press.sameLook.onToggle}
                title={press.sameLook.on ? "The clothes come from the person's card picture, from a new random seed" : 'The clothes and the seed come from the approved frame of another take; anything else in that frame may be copied too'}>{press.sameLook.on ? "Use the card's look" : "Use an earlier frame's look"}</button></p>
          )}
          {/* (prompt-fix pass) open from the start, so the finish's words and what the app adds are seen before the press */}
          <details open={!pop} className={pop ? 'st-sent-pop' : 'st-sent-fold'} data-testid="draw-sent-pop"><summary>What will be sent</summary>{sent}</details>
        </>}
      {building && <p className="st-warn" role="status" data-testid="piece-building">{PIECE_BUILDING}.</p>}
      {!press.drawing && press.gate && <p className="st-muted" data-testid="hero-blocked">{press.gate}</p>}
      {!press.drawing && press.setBehind && <p className="st-warn" data-testid="hero-set-behind">{press.setBehind}</p>}
      {!press.drawing && !press.error && press.nobody && <p className="st-muted" data-testid="hero-nobody">{press.nobody}</p>}
      {press.note && <p className="st-muted" role="status" data-testid="hero-press-note">{press.note}</p>}
      {press.error && (isSetRefusal(press.error) ? <SetRefusal text={press.error} worldId={worldId} />
        : <p className="st-warn" role="alert" data-testid="hero-press-error">{press.error}</p>)}
      {press.onRecover && (
        <p className="st-muted" data-testid="hero-lost">A drawing you paid for did not come back.{' '}
          <button type="button" className="st-btn st-primary" data-testid="hero-recover" title="Fetches the drawing already paid for; it never draws again" onClick={press.onRecover}>Recover the drawing</button></p>
      )}
      {press.finish && (
        <p className="st-muted" data-testid="hero-unfinished">{press.finish.count === 1 ? 'A drawing stopped before its last step.' : `${press.finish.count} drawings stopped before their last step.`}{' '}
          <PriceButton primary={!press.onRecover && !building} verb="Finish the frame" price={press.finish.price} testId="hero-finish" disabled={building}
            title={building ? PIECE_BUILDING : 'Runs only the last step on the drawing you already have; it never draws again'} onClick={press.finish.onFinish} /></p>
      )}
    </div>
  )
}

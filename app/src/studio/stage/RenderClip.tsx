// Render clip, the first-frame window's primary press (owner 10-29): the take's paid render from the version in use, its price on
// the button, "Render again" once a render exists. Every guard is the Stage's (useStageRender.ts): one press at a time (the pill
// while it runs), the price, the stale-frame refusal and its plain reason, a 3D piece building; when only the take's words changed
// since this first frame, the press is the choice of Redraw or Render the new words on this frame (WordsChoice.tsx). "What will be
// sent" (folded) holds the render's exact words as the server composes them, editable for this take (SentJobs.tsx).
// (owner 10-29, later) The press names the version it renders (a thumbnail, "Renders: Edit 2 (…) ✓"), says plainly when the picture
// on screen is another version, and holds while an edit or a version change is still out, so a press mid-edit never renders the
// old version silently. A finished render says so: "Clip ready", played in the window or opened on the Render tab.
import { NO_COMFY_TARGET } from '../../shared/shotContract'
import { currentSceneId } from '../../library/currentScene'
import { JobLine } from '../../jobs/JobLine'
import { studioHash } from '../route'
import { PriceButton } from '../ui'
import { RenderRunPill } from '../render/L2RBlock'
import { againAside } from '../render/l2rModel'
import { RenderNotices } from '../render/renderNotices'
import { WordsChoice } from '../render/WordsChoice'
import { useCurrentTakeId } from '../shoot/currentTake'
import { useFrameEditPublished } from './frameEditStore'
import { PIECE_BUILDING } from './pieceBuilding'
import { RENDER_AFTER, SentJobs, useRenderSent } from './SentJobs'
import { versionName, type FrameEditModel } from './useFrameEdit'
import type { StageRender } from './useStageRender'

/** the press's words: Render clip, else Render again once the take has a render */
export const renderVerb = (rendered: boolean) => (rendered ? 'Render again' : 'Render clip')
/** the press waits for these: the edit's result, or a version change still being written */
export const HOLD_EDIT = 'The edit is still running: Render waits for it, so it renders the new version.'
export const HOLD_PICK = 'Making that version the one in use…'

/** what the press will render, in words, and whether the picture on screen is another version; null while nothing is known */
export function renderTarget(edit: FrameEditModel | null, stillId: string | null | undefined, onScreen: string | null | undefined) {
  if (!edit || !stillId) return null
  const v = edit.versions.find((x) => x.id === stillId)
  if (!v) return null
  const shown = onScreen && onScreen !== stillId ? edit.versions.find((x) => x.id === onScreen) ?? null : null
  return { v, name: versionName(v, edit.versions), other: shown ? versionName(shown, edit.versions) : null }
}

/** why the press holds for the edit, or null */
export function editHold(edit: FrameEditModel | null, stillId: string | null | undefined): string | null {
  if (!edit) return null
  if (edit.editing) return HOLD_EDIT
  if (edit.using !== null) return HOLD_PICK
  // the version in use moved and the render's facts have not read it yet (a moment): it would render the previous one
  if (edit.inUse && stillId && edit.inUse.id !== stillId) return HOLD_PICK
  return null
}

export function RenderClip({ r, onScreen = null, onClip }: { r: StageRender; onScreen?: string | null; onClip?: () => void }) {
  const { l, p, choose, redraw, building } = r
  const edit = useFrameEditPublished()
  const takeId = useCurrentTakeId()
  const sent = useRenderSent(l)
  const stillId = l.state.status?.still?.id ?? null
  const mineEdit = edit && edit.takeId === takeId ? edit : null
  const hold = editHold(mineEdit, stillId)
  const target = renderTarget(mineEdit, stillId, onScreen)
  const again = p.action !== 'l2r' && againAside(l.facts) // done: the primary is the free Finish / Export, the paid press is Render again
  const why = hold ?? (again ? (l.facts.running ? 'A render is running.' : !l.configured ? NO_COMFY_TARGET : building ? PIECE_BUILDING : null) : p.why)
  const paid = p.action === 'l2r' || again
  const price = again ? l.price : p.price
  return (
    <div className="st-renderclip" data-testid="render-clip">
      {r.clip && !r.running && (
        <p className="st-renderclip-ready" role="status" data-testid="render-clip-ready">Clip ready ·{' '}
          {onClip && <><button type="button" className="st-link" data-testid="render-clip-play" onClick={onClip}>Play here</button>{' · '}</>}
          <a className="st-link" href={studioHash('render', currentSceneId())} data-testid="render-clip-open">Open on the Render tab</a></p>
      )}
      {paid && !r.running && (
        <details className="st-sent-pop" data-testid="render-sent-pop"><summary>What will be sent</summary>
          <SentJobs jobs={sent} testId="render-sent" after={RENDER_AFTER} takeId={takeId} keys={['render']} /></details>
      )}
      {paid && !r.running && target && (
        <div className="st-renders" data-testid="render-target">
          <img src={target.v.png} alt="" width={48} height={27} />
          <span>Renders: {target.name} ✓</span>
        </div>
      )}
      {paid && !r.running && target?.other && (
        <p className="st-warn" data-testid="render-target-other">On screen is {target.other}, but the render uses {target.name}, the version with the ✓. To render the one on screen, click it in the versions.</p>
      )}
      <div className="st-renderclip-press">
        {r.running ? <RenderRunPill l={l} />
          : choose ? <WordsChoice l={l} redraw={redraw} price={price} disabled={!!why || price === null} why={why} />
          : <PriceButton primary={!why && price !== null} verb={renderVerb(l.facts.rendered)} price={price} disabled={!paid || !!why || price === null}
            title={why ?? (target ? `Renders the clip from the clay video and ${target.name}` : 'Renders the clip from the clay video and the version in use')} onClick={() => void l.render()} testId="render-primary" />}
      </div>
      {!r.running && why && <p className="st-muted" data-testid="render-why">{why}</p>}
      <JobLine line={l.state.error} testId="render-error" />
      <RenderNotices l={l} quietOnError />
    </div>
  )
}

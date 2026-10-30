import { useState } from 'react'
import { NO_COMFY_TARGET, type L2RMissing } from '../../shared/shotContract'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { RowHead } from '../Seg'
import { Lightbox, PriceButton, renderEstimate, RunPill, type LightboxItem } from '../ui'
import { clayFrameItem } from '../shoot/clayFrame'
import { L2RAdvanced } from './L2RAdvanced'
import { FinishingNote } from './FinishingNote'
import { finishWords } from './finishChoice'
import { L2RPlayer } from './L2RPlayer'
import { ShotsList } from './ShotsList'
import { serverRunning } from './l2rStore'
import { SafeImg } from './SafeImg'
import { chipItem, pictureChips } from './RefChips'
import type { RefChip } from './l2rExtra'
import { againAside, interruptedRender, L2R_UNKNOWN_TAG, pressRender, useL2R, type L2RHook } from './l2rModel'
import { JobLine } from '../../jobs/JobLine'
import { RenderNotices } from './renderNotices'
import { WORDS_CHANGED } from '../../shared/wordsOnFrame'
import './render.css'

const STILL_CODES = ['no_still', 'stale_still']
/** not a gap: the frame stays valid, and the Stage's steps ask which way (WordsChoice.tsx) */
const NOT_GAPS = ['unknown_tag', 'words_changed']

function Gap({ m }: { m: L2RMissing | undefined }) {
  return <div className="st-l2r-gap" data-testid={`l2r-missing-${m?.code ?? 'unknown'}`}>{m ? `${m.message} ${m.where}` : 'Not ready.'}</div>
}

/** The take's two inputs: the approved still (the look; click for full size) and the clay video (the layout), or what is missing and where to get it. */
function Inputs({ l, onOpen }: { l: L2RHook; onOpen: () => void }) {
  const st = l.state.status
  const missing = st?.missing ?? []
  const stillGap = missing.find((m) => STILL_CODES.includes(m.code))
  const clayGap = missing.find((m) => !STILL_CODES.includes(m.code) && !NOT_GAPS.includes(m.code))
  return (
    <div className="st-l2r-inputs">
      <figure>
        {st?.still && !stillGap
          ? <button type="button" className="st-l2r-open" title="Open full size" onClick={onOpen}><SafeImg src={st.still.png} alt="the approved hero still" testId="l2r-still" line="This still is not available. Approve an opening still on the Stage." /></button>
          : <Gap m={stillGap} />}
        <figcaption>Look · approved opening still</figcaption>
      </figure>
      <figure>
        {st?.clay?.mp4 && !clayGap ? <video src={st.clay.mp4} muted playsInline preload="metadata" data-testid="l2r-clay" /> : <Gap m={clayGap} />}
        <figcaption>Layout · 3D set preview{st?.take ? ` · ${st.take.frames} f` : ''}</figcaption>
      </figure>
    </div>
  )
}

/** A keyframe chip against the 3D set frame it was drawn on (the clay's own PNG of frame 0, the mid or the last), when there is one. */
function compareOf(l: L2RHook, c: RefChip): LightboxItem | undefined {
  const st = l.state.status
  if (!st?.take) return undefined
  const frame = c.role === 'opening' ? 0 : c.role === 'end' ? st.take.frames - 1 : c.role === 'mid' ? st.keyframes?.mid?.frame : undefined
  return frame === undefined ? undefined : clayFrameItem(st.take, st.clay, frame)
}

/** Progress, failures and recovery for the render on show. Recover fetches the job by id and never resubmits. */
function Activity({ l }: { l: L2RHook }) {
  const { state: s, current: cur, lost } = l
  const run = s.status?.running
  const cut = interruptedRender(s)
  return (
    <>
      <RenderNotices l={l} quietOnError />
      {cut && !run && !s.posting && <p className="st-muted" data-testid="l2r-interrupted">{cut.error ?? 'The last render stopped before it reached Cloud: nothing was billed.'}</p>}
      <JobLine line={s.error} testId="l2r-error" />
      {lost && !run && (
        <div className="st-actions" data-testid="l2r-lost">
          <span className="st-warn">A paid render never came back (job {lost.jobId}).</span>
          <PriceButton verb="Recover" price={0} disabled={s.working} onClick={() => void l.recover(lost.jobId!)} testId="l2r-recover" />
        </div>
      )}
      {cur?.status === 'done' && cur.finishError && !l.finishingNow && (
        <div className="st-actions"><span className="st-warn">{cur.finishError}</span>
          <PriceButton verb="Finish again" price={0} disabled={s.working} onClick={() => void l.finish(cur.id)} testId="l2r-finish" /></div>
      )}
    </>
  )
}

/**
 * Render's primary path (docs/wave-b-contract.md, T3): one Layout-To-Render pass of a locked take's clay with its approved
 * hero still as the look, then the free finish (sharpen + grain). Pick the take, see both inputs (or what is missing and
 * where to get it) and whether it is ready (the paid Render press is the screen's primary button), watch it run, then play
 * Finished / Raw.
 */
/** The secondary paid "Render again", shown beside the primary Finish / Export in Render's press bar (null when the primary is already the paid render). */
export function RenderAgain({ l }: { l: L2RHook }) {
  if (!againAside(l.facts) || renderRunning(l)) return null
  const busy = l.facts.running
  const why = busy ? 'A render is running.' : !l.configured ? NO_COMFY_TARGET : null
  return (
    <PriceButton verb="Render again" price={l.price} disabled={busy || !l.configured || l.price === null} testId="l2r-render-again"
      title={why ?? 'A new paid render of this take from a fresh seed; the current one is kept'} onClick={() => void l.render()} />
  )
}

/** a paid render is in flight (posting, or the server says one runs); the free finish does not count */
export const renderRunning = (l: L2RHook): boolean => l.state.posting || serverRunning(l.state)

/** Takes the primary Render button's place while the render runs (the screen swaps it in; null otherwise). */
export function RenderRunPill({ l }: { l: L2RHook }) {
  if (!renderRunning(l)) return null
  // "N cr spent" only once the server says the render runs: a press it refuses (day budget, 429, the one-paid-job lock) spent nothing
  const started = serverRunning(l.state)
  return <RunPill label={started ? 'rendering on Comfy Cloud' : 'sending the render'} since={l.state.status?.running?.since ?? null} estimate={renderEstimate(l.state.status?.take?.frames)}
    price={started ? l.price : null} testId="render-pill" />
}

export function L2RBlock({ lab }: { lab: ProjectionLabState }) {
  void lab
  const l = useL2R()
  const s = l.state
  const [lb, setLb] = useState<number | null>(null)
  if (!s.takes.length) {
    return (
      <div className="st-l2r" data-testid="l2r-block">
        <RowHead title="Final render" />
        <p className="st-muted" data-testid="l2r-no-takes">No locked take for this scene yet. On the Stage, film a take, lock it and draw its first frame; then {pressRender()}.</p>
      </div>
    )
  }
  const busy = l.facts.running
  // the pictures the lightbox walks: opening, mid, end and the references, or the approved still alone on an older server
  const pics: RefChip[] = pictureChips(s.status?.chips).length ? pictureChips(s.status?.chips)
    : s.status?.still ? [{ role: 'opening', label: 'Look · opening still', url: s.status.still.png, sent: true }] : []
  const tagGap = s.status?.missing?.find((m) => m.code === 'unknown_tag')
  const why = !l.facts.take ? null : !l.facts.clay || !l.facts.still ? 'Needs the prepared frames and an approved opening still (see above).' : !l.facts.prompt ? L2R_UNKNOWN_TAG : !l.configured ? NO_COMFY_TARGET : busy ? 'A render is running.' : null
  return (
    <div className="st-l2r" data-testid="l2r-block">
      <RowHead title="Final render" hint={s.status?.estimate?.basis} />
      <ShotsList l={l} />
      <Inputs l={l} onOpen={() => setLb(Math.max(0, pics.findIndex((c) => c.role === 'opening')))} />
      <Lightbox items={pics.map(chipItem)} index={lb} onIndex={setLb} onClose={() => setLb(null)} compare={lb !== null && pics[lb] ? compareOf(l, pics[lb]) : undefined} />
      {tagGap && !l.state.prompt.trim() && <p className="st-warn" data-testid="l2r-missing-unknown_tag">{tagGap.message} {tagGap.where}</p>}
      {/* the paid press is the Stage's steps block's primary (primaryAction.ts); once a render is done and the primary is the free
          Finish / Export, "Render again" is the one paid button, beside it there (never both at once) */}
      {l.facts.take && (
        <p className="st-muted" data-testid="l2r-status">
          {why ?? (l.facts.wordsChanged ? `${WORDS_CHANGED} In the first frame's window on the Stage, redraw the first frame from the new words or render the new words on this frame${l.price !== null ? ` (≈ ${l.price} cr)` : ''}.`
            : l.facts.rendered && !l.facts.again ? `Rendered. For another try from a fresh seed, ${pressRender('Render again')}.`
            : `Ready: ${pressRender(l.facts.rendered ? 'Render again' : 'Render clip')}${l.price !== null ? ` (≈ ${l.price} cr)` : ''}.`)}
        </p>
      )}
      {l.facts.running && !s.posting && !l.finishingNow && (
        <p className="st-muted" data-testid="l2r-recheck">Still showing a render? <button type="button" className="st-btn sc-small" onClick={() => void l.refresh()}>Check again</button></p>
      )}
      <Activity l={l} />
      <FinishingNote renderId={l.current?.id} on={l.finishingNow} words={finishWords(s.picks, l.current)} />
      {l.current?.status === 'done' && l.current.raw && <L2RPlayer render={l.current} />}
      <L2RAdvanced l={l} onOpenChip={setLb} />
    </div>
  )
}

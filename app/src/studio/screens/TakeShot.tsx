import { currentSceneId } from '../../library/currentScene'
import { recordExport } from '../../library/sceneExports'
import type { L2RRender, TakeRecord } from '../../shared/shotContract'
import { currentRender } from '../render/l2rModel'
import { useL2RState, type L2RState } from '../render/l2rStore'
import { takeLength } from '../render/ShotsList'
import { displayName } from '../names'
import { RowHead } from '../Seg'
import { studioHash } from '../route'

/** Export's line over a render whose free finish has not landed: where it runs and how to get there */
export const FINISH_HINT = 'Finishing runs while the Render page is open: go back to Render and wait for Finished.'

export interface TakeShotState {
  takeId: string | null
  render: L2RRender | null
  /** the picked take's record (its lock date and length), when the store has it */
  take?: TakeRecord | null
  /** the remembered pick was gone: which take is shown instead */
  note?: string | null
  /** the store as read (Export's other shots list the same world's takes) */
  state?: L2RState
}

/** The take picked on Render (the one store Render reads, scoped to this world) and its newest done render. */
export function useTakeShot(worldId: string | null | undefined): TakeShotState {
  const s = useL2RState(worldId ?? null)
  const cur = worldId ? currentRender(s) : null
  const takeId = worldId ? s.takeId : null
  return { takeId, render: cur?.status === 'done' && (cur.finished ?? cur.raw) ? cur : null, take: s.takes.find((t) => t.id === takeId) ?? null, note: s.pickNote ?? null, state: s }
}

/** the picked take in words: its name (when it was locked) and its length */
const takeWords = (shot: TakeShotState): string => `${displayName(shot.takeId!)}${shot.take ? ` · ${takeLength(shot.take)}` : ''}`

/** Export's first row: the picked take's rendered shot, named, played here and downloadable as a file (free; it is already on disk). */
export function TakeShot({ shot }: { shot: TakeShotState }) {
  const r = shot.render
  if (!shot.takeId) return null
  const note = shot.note ? <p className="st-warn" data-testid="export-pick-note">{shot.note}</p> : null
  if (!r) {
    return (
      <div data-testid="export-take-shot">
        <RowHead title="This take's shot" hint="not rendered" />
        {note}
        <p className="st-muted" data-testid="export-take-none">{takeWords(shot)} has no rendered shot yet. Pick another take on Render, or render this one from the Stage.</p>
      </div>
    )
  }
  const url = (r.finished ?? r.raw)!
  return (
    <div data-testid="export-take-shot">
      <RowHead title="This take's shot" hint={r.finished ? 'finished' : 'raw, not finished yet'} />
      {note}
      <p className="st-muted" data-testid="export-take-name">{takeWords(shot)}</p>
      <video src={url} controls muted playsInline preload="metadata" style={{ width: '100%' }} />
      <div className="st-actions">
        <a className="st-btn st-primary" href={url} download={`${shot.takeId}.mp4`} data-testid="export-take-download"
          onClick={() => recordExport(currentSceneId(), { takeId: shot.takeId!, url, finished: !!r.finished })}>Download the shot</a>
        {!r.finished && (
          <>
            <span className="st-warn" data-testid="export-unfinished">{FINISH_HINT}</span>
            <a className="st-btn" href={studioHash('render', currentSceneId())} data-testid="export-to-render">Go to Render</a>
          </>
        )}
        <span className="st-muted">free · 1920 × 1088 · {r.frames ?? '?'} f</span>
      </div>
    </div>
  )
}

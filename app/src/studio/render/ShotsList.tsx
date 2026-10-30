import type { ShotRow, ShotState } from '../../shared/shotsListContract'
import type { TakeRecord } from '../../shared/shotContract'
import { displayName } from '../names'
import { RowHead } from '../Seg'
import type { L2RHook } from './l2rModel'
import { useShots } from './useShots'
import './shots.css'

export const SHOT_STATE_WORDS: Record<ShotState, string> = { none: 'not rendered', rendering: 'rendering', raw: 'raw, not finished', finished: 'finished', failed: 'failed' }

/** a take's length in seconds (24 fps) */
export const takeLength = (t: Pick<TakeRecord, 'frames'>): string => `${(t.frames / 24).toFixed(1)} s`

/** the row's facts line: length, its newest render's state, what it billed when that was measured */
export function shotLine(t: Pick<TakeRecord, 'frames'>, row: ShotRow | undefined): string {
  const credits = row?.credits != null ? ` · ${row.credits} cr billed` : ''
  return `${takeLength(t)} · ${row ? SHOT_STATE_WORDS[row.state] : 'not rendered'}${credits}`
}

/** the viewer's video, from its start (the row on show was played again) */
function replay() {
  const v = document.querySelector<HTMLVideoElement>('[data-testid="render-video"]')
  if (v) { v.currentTime = 0; void v.play().catch(() => { /* autoplay refused: the controls are there */ }) }
}

/** the take's picture: its approved opening still, else a frame of its render, else an empty box */
function Thumb({ row }: { row: ShotRow | undefined }) {
  if (row?.thumb) return <img className="st-shot-thumb" src={row.thumb} alt="" loading="lazy" />
  if (row?.video) return <video className="st-shot-thumb" src={`${row.video}#t=0.5`} muted playsInline preload="metadata" />
  return <span className="st-shot-thumb st-shot-thumb-none" />
}

/**
 * Render's shots list: every locked take of the scene's set, newest first, each with its picture, when it was locked and its
 * length, its newest render's state and what it billed. Picking a row is the one take Render, Export and the Stage's render
 * overlay read (l2rStore pick, remembered for the scene); Play picks it and plays its render in the viewer.
 */
export function ShotsList({ l }: { l: L2RHook }) {
  const s = l.state
  const rows = useShots(s)
  const byId = new Map(rows.map((r) => [r.takeId, r]))
  return (
    <div className="st-shots" data-testid="l2r-shots">
      <RowHead title="Shots" hint={`${s.takes.length} take${s.takes.length === 1 ? '' : 's'}`} />
      {s.pickNote && <p className="st-warn" data-testid="l2r-pick-note">{s.pickNote}</p>}
      <ul className="st-shot-list">
        {s.takes.map((t) => {
          const row = byId.get(t.id), on = t.id === s.takeId
          return (
            <li key={t.id} className={`st-shot${on ? ' st-shot-on' : ''}`} data-testid={`l2r-shot-${t.id}`}>
              <button type="button" className="st-shot-pick" aria-pressed={on} data-testid={`l2r-shot-pick-${t.id}`} onClick={() => { if (!on) l.pick(t.id) }}>
                <Thumb row={row} />
                <span className="st-shot-text">
                  <b>{displayName(t.id)}</b>
                  <span className="st-muted" data-testid={`l2r-shot-line-${t.id}`}>{shotLine(t, row)}</span>
                </span>
              </button>
              {row?.video && (
                <button type="button" className="st-btn sc-small" data-testid={`l2r-shot-play-${t.id}`} title="Show this take and play its render"
                  onClick={() => { if (on) replay(); else l.pick(t.id) }}>Play</button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

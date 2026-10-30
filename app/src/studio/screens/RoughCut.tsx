import { CUT_FPS, cutFrames, moveCut, removeSegment, retake, splitAt, type CutTake } from '../../labs/projection/cut'
import { displayName } from '../names'
import type { ExportCut } from './useExportCut'

export const takeLabel = (t: CutTake) => `${displayName(t.warpFolder)} · ${t.kind} ${t.width}×${t.height}${t.hasAudio ? '' : ' · no audio'}`

/** The rough cut (Advanced): segments over the shared clock, cut points to type, split at the playhead. Not the product's job (L7). */
export function RoughCut({ x }: { x: ExportCut }) {
  const { segs, setSegs, takes, playhead } = x
  const last = segs.length - 1
  const num = (fn: (v: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => { const v = Number(e.target.value); if (Number.isInteger(v)) fn(v) }
  const setEnd = (k: number, v: number) => setSegs(segs.map((s, j) => (j === k ? { ...s, out: v } : s)))
  const setStart = (k: number, v: number) => setSegs(segs.map((s, j) => (j === k ? { ...s, in: v } : s)))
  const frames = cutFrames(segs)
  if (segs.length === 0) return <p className="st-muted" data-testid="cut-nocommon">These renders do not overlap on the clock, so there is no cut to start from.</p>
  return (
    <div data-testid="rough-cut">
      {segs.map((s, k) => (
        <div key={k} className="st-seg-row" data-testid="cut-seg-row">
          <b>{k + 1}</b>
          <select className="st-select" value={s.takeId} onChange={(e) => setSegs(retake(segs, k, e.target.value))} aria-label={`take for segment ${k + 1}`}>
            {takes.map((t) => <option key={t.id} value={t.id}>{takeLabel(t)}</option>)}
          </select>
          <input className="st-input" type="number" value={s.in} aria-label={`in of segment ${k + 1}`} onChange={num((v) => (k === 0 ? setStart(0, v) : setSegs(moveCut(segs, k - 1, v))))} />
          <input className="st-input" type="number" value={s.out} aria-label={`out of segment ${k + 1}`} onChange={num((v) => (k === last ? setEnd(k, v) : setSegs(moveCut(segs, k, v))))} />
          <button type="button" className="st-btn" onClick={() => setSegs(removeSegment(segs, k))} disabled={segs.length < 2} aria-label={`remove segment ${k + 1}`}>×</button>
        </div>
      ))}
      <div className="st-actions">
        <button type="button" className="st-btn" onClick={() => setSegs(splitAt(segs, playhead))} data-testid="cut-split">Cut at playhead</button>
        <button type="button" className="st-btn" onClick={x.reset}>Start over</button>
      </div>
      <p className="st-muted" data-testid="cut-summary">{frames} frames · {(frames / CUT_FPS).toFixed(1)} s at {CUT_FPS} fps · {x.size.width}×{x.size.height}</p>
      {x.errors.map((e) => <p key={e} className="st-warn" data-testid="cut-error">{e}</p>)}
    </div>
  )
}

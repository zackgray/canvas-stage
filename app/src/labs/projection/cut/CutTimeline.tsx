import { useRef } from 'react'
import { CUT_FPS, takeRange, type CutSegment, type CutTake } from './model'

const HUES = [210, 28, 140, 300, 50, 180]
const label = (t: CutTake) => `${t.warpFolder.slice(5)} · ${t.kind} · ${t.width}×${t.height}`

/** The performance clock: one row per take (what it covers), then the cut row with a draggable handle at every cut point. */
export function CutTimeline({ takes, segs, playhead, onMove, onSeek }: {
  takes: CutTake[]
  segs: CutSegment[]
  playhead: number
  onMove: (i: number, frame: number) => void
  onSeek: (frame: number) => void
}) {
  const lo = Math.min(...takes.map((t) => takeRange(t)[0]))
  const hi = Math.max(...takes.map((t) => takeRange(t)[1]))
  const span = Math.max(1, hi - lo)
  const pct = (f: number) => `${((f - lo) / span) * 100}%`
  const bar = useRef<HTMLDivElement>(null)
  const drag = useRef<number | null>(null)
  const frameAt = (x: number) => {
    const r = bar.current!.getBoundingClientRect()
    return Math.round(lo + Math.min(1, Math.max(0, (x - r.left) / r.width)) * span)
  }
  const hue = (id: string) => HUES[takes.findIndex((t) => t.id === id) % HUES.length]
  return (
    <div className="cut-tl" data-testid="cut-timeline">
      {takes.map((t) => {
        const [a, b] = takeRange(t)
        return (
          <div key={t.id} className="cut-row" title={label(t)}>
            <span className="cut-row-label">{label(t)}</span>
            <div className="cut-row-bar"><i style={{ left: pct(a), width: `${((b - a) / span) * 100}%`, background: `hsl(${hue(t.id)} 45% 38%)` }} /></div>
          </div>
        )
      })}
      <div className="cut-row">
        <span className="cut-row-label">Cut</span>
        <div className="cut-row-bar cut-cutbar" ref={bar} onPointerDown={(e) => { if (drag.current === null) onSeek(frameAt(e.clientX)) }}
          onPointerMove={(e) => { if (drag.current !== null) onMove(drag.current, frameAt(e.clientX)) }}
          onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
          {segs.map((s, i) => (
            <i key={i} style={{ left: pct(s.in), width: `${((s.out - s.in) / span) * 100}%`, background: `hsl(${hue(s.takeId)} 55% 46%)` }} data-testid="cut-seg">{i + 1}</i>
          ))}
          {segs.slice(1).map((s, i) => (
            <b key={i} className="cut-handle" style={{ left: pct(s.in) }} data-testid="cut-handle"
              onPointerDown={(e) => { e.stopPropagation(); drag.current = i; e.currentTarget.parentElement!.setPointerCapture(e.pointerId) }} />
          ))}
          <u className="cut-playhead" style={{ left: pct(playhead) }} />
        </div>
      </div>
      <div className="cut-ticks"><span>f{lo}</span><span>{((hi - lo) / CUT_FPS).toFixed(1)} s on the performance clock</span><span>f{hi}</span></div>
    </div>
  )
}

import { FinishingNote } from '../render/FinishingNote'
import { finishWords } from '../render/finishChoice'
import { pressRender, type L2RHook } from '../render/l2rModel'

type ViewerL2R = Pick<L2RHook, 'current' | 'facts' | 'finishingNow'> & Partial<Pick<L2RHook, 'state'>>

/** The render on show: this take's Layout-To-Render cut, finished once the free finish lands, else the raw; none = null. */
export function viewUrl(l: Pick<L2RHook, 'current'>): string | null {
  const cur = l.current
  // a finish again writes the same file name: the time it landed keeps the player from showing the old cut
  return cur?.status === 'done' ? (cur.finished ? `${cur.finished}${cur.finishedAt ? `?v=${Date.parse(cur.finishedAt)}` : ''}` : cur.raw) ?? null : null
}

/** What the empty player says: what to do next for this scene's take (never another scene's footage). */
export function emptyLine(l: Pick<L2RHook, 'facts'>): string {
  const f = l.facts
  if (!f.take) return `Nothing rendered for this scene yet. On the Stage, film a take and lock it; then draw its first frame and ${pressRender()}.`
  if (!f.still) return `Draw and pick a first frame for this take on the Stage, then ${pressRender()}.`
  return f.running ? 'Rendering: the shot shows here as it lands.' : `Not rendered yet: ${pressRender()} and the shot shows here.`
}

/** The result pane: the take's render (finished, else raw), or what to do next. A new render landing replaces it. */
export function RenderViewer({ l }: { l: ViewerL2R }) {
  const url = viewUrl(l)
  return (
    <div data-testid="render-viewer">
      <div className="st-hero st-hero-render">
        {url
          ? <video key={url} src={url} autoPlay loop muted playsInline controls data-testid="render-video" />
          : <p className="st-hero-empty" data-testid="render-empty">{emptyLine(l)}</p>}
        {url && <span className="st-tag">Render · 1920 × 1088</span>}
      </div>
      <FinishingNote renderId={l.current?.id} on={l.finishingNow} words={l.state ? finishWords(l.state.picks, l.current) : undefined} />
    </div>
  )
}

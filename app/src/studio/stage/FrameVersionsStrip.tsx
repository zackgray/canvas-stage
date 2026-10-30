// The version strip under "Edit this frame" (owner 10-28, simplified 10-29): every version of the first frame, newest first, nothing
// overwritten. No buttons: one click on a picture selects that version. It shows full size above, becomes the frame the render and the
// draws use (the existing approve press, so the stale-frame guard is the one that has always run) and the base of the next edit. The
// selected version wears a green ✓ and a green outline. A stale version can be looked at, never used or edited from; while an edit or
// an approval runs, a click only looks.
import { STALE_START } from '../../shared/startKey'
import type { FrameEditModel, FrameVersion } from './useFrameEdit'

/** the one line under the strip */
export const STRIP_NOTE = 'Click a version to use it: the render uses it and the next edit starts from it. Free.'

function Version({ s, model, onScreen }: { s: FrameVersion; model: FrameEditModel; onScreen: boolean }) {
  const inUse = model.inUse?.id === s.id
  const why = s.staleWhy ?? STALE_START
  return (
    <li data-testid={`frame-version-${s.id}`} style={{ flex: '0 0 auto', width: 112, opacity: s.stale ? 0.55 : 1 }}>
      <button type="button" className="st-frame-thumb" data-testid={`frame-show-${s.id}`} aria-pressed={inUse || onScreen}
        title={s.stale ? `Stale, so it can be looked at but not used: ${why}` : inUse ? 'In use: the render and the draws use this version, and the next edit starts from it' : 'Click to use this version: shows it full size, the render and the draws use it, and the next edit starts from it'}
        onClick={() => void model.onSelect(s.id)}>
        <img src={s.png} alt={`Version ${s.id}`} width={112} height={63}
          style={{ display: 'block', outline: inUse ? '2px solid var(--st-ok)' : onScreen ? '2px solid currentColor' : undefined, outlineOffset: -2 }} />
        {inUse && <span className="st-frame-badge" data-testid={`frame-in-use-${s.id}`} aria-label="In use">✓</span>}
        {s.stale && <span className="st-frame-stale" data-testid={`frame-stale-${s.id}`} title={why}>stale</span>}
      </button>
    </li>
  )
}

/** `onScreen`: the id of the version the still view shows (outlined) */
export function FrameVersionsStrip({ model, onScreen = null }: { model: FrameEditModel; onScreen?: string | null }) {
  if (!model.versions.length) return null
  return (
    <div>
      <ul data-testid="frame-versions" style={{ display: 'flex', gap: 8, overflowX: 'auto', listStyle: 'none', margin: 0, padding: 0 }}>
        {model.versions.map((s) => <Version key={s.id} s={s} model={model} onScreen={s.id === onScreen} />)}
      </ul>
      <p className="st-muted" data-testid="frame-versions-note" style={{ fontSize: 12, marginTop: 6 }}>{STRIP_NOTE}</p>
    </div>
  )
}

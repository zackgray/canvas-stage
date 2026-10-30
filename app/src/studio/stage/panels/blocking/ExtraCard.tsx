// One extra in Blocking: path (or the spot, for a stander), Walk / Stand, gait, delay, who plays it, its scene tag (which dresses
// it: no Costume picker), where a stander faces and what it looks at. A walking path under 3 m gets the red "will lurch" line with its length in metres.
import { Select } from '../../../ui'
import { pathLength } from './blockingMath'
import { shortLine, tooShort } from './extraStaging'
import type { Blocking } from './useBlocking'

const num = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? undefined : Number(v))

export function ExtraCard({ b, n, tagOpts, variantOpts }: { b: Blocking; n: number; tagOpts: { value: string; label: string }[]; variantOpts: { value: string; label: string }[] }) {
  const { draft, target } = b
  const e = draft.extras[n]
  const drawing = target.kind === 'extra' && target.n === n
  const picking = (k: 'face' | 'look') => target.kind === k && target.n === n
  const toggle = (k: 'face' | 'look') => b.setTarget(picking(k) ? { kind: 'select' } : { kind: k, n })
  const stand = !!e.stand
  const len = pathLength(e.path)
  const looks = (e.actions ?? []).flatMap((a, i) => (a.kind === 'look' ? [{ a, i }] : []))
  return (
    <div className="bl-extra" data-testid={`blocking-extra-${n}`}>
      <div className="bl-item">
        <span className="bl-item-name">Extra {n + 1}</span>
        <span className="st-field-hint" data-testid={`blocking-extra-${n}-length`}>
          {stand ? (e.path.length ? 'standing' : 'no spot yet') : `${e.path.length} point${e.path.length === 1 ? '' : 's'} · ${len.toFixed(1)} m`}
          {b.through.extras[n]?.length ? ' · runs through the set' : ''}
        </span>
        <button type="button" className={drawing ? 'st-btn bl-on' : 'st-btn'} onClick={() => b.setTarget(drawing ? { kind: 'select' } : { kind: 'extra', n })}
          data-testid={`blocking-extra-${n}-draw`}>{drawing ? 'Done' : stand ? 'Move' : 'Redraw'}</button>
        <button type="button" className="st-btn bl-x" onClick={() => b.extras.remove(n)} aria-label={`Remove extra ${n + 1}`}>×</button>
      </div>
      {tooShort(e) && <span className="bl-warn" data-testid={`blocking-extra-${n}-short`}>{shortLine}</span>}
      {drawing && !stand && e.path.length > 0 && (
        <button type="button" className="st-btn" onClick={() => b.extras.set(n, { path: [] })} data-testid={`blocking-extra-${n}-clear`}>Clear its path</button>
      )}
      <div className="bl-row">
        <Select label="Does" value={stand ? 'stand' : 'walk'} options={[{ value: 'walk', label: 'walk a path' }, { value: 'stand', label: 'stand still' }]}
          onChange={(v) => b.extras.setStand(n, v === 'stand')} testId={`blocking-extra-${n}-mode`} />
        {!stand && <Select label="Gait" value={e.gait} options={[{ value: 'walk', label: 'walk' }, { value: 'run', label: 'run' }]} onChange={(g) => b.extras.set(n, { gait: g })} />}
        {!stand && (
          <label className="st-field">Delay s<input className="st-input bl-num" type="number" min="0" step="0.1" value={e.delay}
            onChange={(ev) => b.extras.set(n, { delay: Math.max(0, Number(ev.target.value) || 0) })} data-testid={`blocking-extra-${n}-delay`} /></label>
        )}
      </div>
      <div className="bl-row">
        <Select label="Played by" value={String(e.variant)} options={variantOpts} onChange={(v) => b.extras.set(n, { variant: Number(v) })}
          testId={`blocking-extra-${n}-variant`} />
        <Select label="Tag" value={e.tag ?? ''} options={tagOpts} onChange={(t) => b.extras.setTag(n, t)} hint="Dressed from the tag's words." testId={`blocking-extra-${n}-tag`} />
      </div>
      <div className="bl-row">
        {stand && (
          <button type="button" className={picking('face') ? 'st-btn bl-on' : 'st-btn'} onClick={() => toggle('face')} data-testid={`blocking-extra-${n}-face`}
            title="Click the ground where they face; unset, they face the hero's start">{e.face ? 'Faces: change' : 'Faces the hero: change'}</button>
        )}
        <button type="button" className={picking('look') ? 'st-btn bl-on' : 'st-btn'} onClick={() => toggle('look')} disabled={e.path.length === 0}
          data-testid={`blocking-extra-${n}-look`} title="Click the ground they look at">Look at…</button>
      </div>
      {(picking('face') || picking('look')) && <span className="st-field-hint">Click the ground {picking('face') ? 'where they face' : 'they look at'}.</span>}
      {looks.map(({ a, i }) => (
        <div key={i} className="bl-item" data-testid={`blocking-extra-${n}-look-${i}`}>
          <span className="bl-item-name">look</span>
          <label className="bl-mini">s<input className="st-input" type="number" step="0.5" min="0" value={a.seconds ?? 2}
            onChange={(ev) => b.extras.setLook(n, i, { seconds: Math.max(0, num(ev.target.value) ?? 0) })} /></label>
          <label className="bl-mini">°<input className="st-input" type="number" step="15" value={a.deg ?? 45}
            onChange={(ev) => b.extras.setLook(n, i, { deg: num(ev.target.value) ?? 0 })} /></label>
          <button type="button" className="st-btn bl-x" onClick={() => b.extras.removeAction(n, i)} aria-label="Remove look">×</button>
        </div>
      ))}
    </div>
  )
}

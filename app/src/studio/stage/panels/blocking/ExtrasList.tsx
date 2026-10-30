// Extras: add one from a crossing preset (placed relative to the hero's path) or draw its path; each walks or stands, looks, and
// is told apart by Bible tag. Named people nobody has staged yet are offered here, one click each, standing and facing the hero.
import { tagOptions } from './bibleTags'
import { CROSSINGS } from './crossings'
import { ExtraCard } from './ExtraCard'
import type { Blocking } from './useBlocking'

/** why the crossing presets are off while the hero stands (they are placed along his walk) */
const NEEDS_WALK = 'Needs a walking path'

export function ExtrasList({ b }: { b: Blocking }) {
  const { draft } = b
  const tags = tagOptions(b.bible, 'extras')
  const tagOpts = [{ value: '', label: 'no tag' }, ...tags.map((t) => ({ value: t.tag, label: t.label }))]
  const variantOpts = Array.from({ length: b.variants }, (_, i) => ({ value: String(i), label: `variant ${i + 1}` }))
  return (
    <div className="bl-group" data-testid="blocking-extras">
      <div className="bl-head">Extras</div>
      <div className="bl-row">
        {CROSSINGS.map((c) => (
          <button key={c.id} type="button" className="st-btn" title={draft.path.length < 2 ? NEEDS_WALK : c.hint} disabled={draft.path.length < 2 || b.busy}
            onClick={() => b.extras.addPreset(c.id)} data-testid={`blocking-extra-preset-${c.id}`}>{c.label}</button>
        ))}
        <button type="button" className="st-btn" disabled={b.busy} onClick={b.extras.addDrawn} data-testid="blocking-extra-draw">Draw a path</button>
      </div>
      {draft.path.length < 2 && <span className="st-field-hint" data-testid="blocking-presets-off">Crossings need a walking path for the hero, who stands at the mark now.</span>}
      {b.unstaged.length > 0 && (
        <div className="bl-row" data-testid="blocking-unstaged">
          <span className="bl-warn">The scene names {b.unstaged.map((u) => u.label).join(', ')} but nobody stages them: the render would invent them.</span>
          {b.unstaged.map((u) => (
            <button key={u.tag} type="button" className="st-btn" disabled={b.busy || draft.path.length === 0} onClick={() => b.extras.stage(u.tag)}
              title="Stand them beside the hero's start, facing the hero" data-testid={`blocking-stage-${u.tag}`}>Stage {u.label} (standing, facing the hero)</button>
          ))}
        </div>
      )}
      {draft.extras.map((_, n) => <ExtraCard key={n} b={b} n={n} tagOpts={tagOpts} variantOpts={variantOpts} />)}
      {!b.bible?.extrasSheet && draft.extras.length > 0 && <span className="st-field-hint">No extras on the scene sheet yet: variants are placeholders.</span>}
    </div>
  )
}

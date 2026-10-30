// Small shared pieces of the Scene design: an image that fades in once, a tag chip, a stacked panel.
import { useState, type ReactNode } from 'react'
import { CONCEPT_CR, CONCEPT_MORE, type ConceptQuality } from '../../shared/sceneContract'
import type { PieceType } from './briefApi'
import { CHIP_CLS } from './design/model'

/** sources that have loaded once on this page: shown at once on any later mount, so nothing flashes */
const loaded = new Set<string>()

/** An image that fades in the first time it loads and never again. `contain` shows it whole. */
export function Img({ src, alt = '', contain }: { src: string; alt?: string; contain?: boolean }) {
  const [on, setOn] = useState(() => loaded.has(src))
  return <img src={src} alt={alt} className={`sd-img${on ? ' in' : ''}${contain ? ' wh' : ''}`} draggable={false}
    onLoad={() => { loaded.add(src); setOn(true) }} />
}

export function Chip({ tag, type, gone, added, onClick, testId }: {
  tag: string; type?: PieceType; gone?: boolean; added?: boolean; onClick?: () => void; testId?: string
}) {
  const cls = `sd-chip ${type ? CHIP_CLS[type] : ''}${gone ? ' gone' : ''}${added ? ' add' : ''}`
  return onClick
    ? <button type="button" className={cls} onClick={(e) => { e.stopPropagation(); onClick() }} data-testid={testId}
      title={gone ? 'This tile was deleted' : 'Open its piece'}>@{tag}</button>
    : <span className={cls} data-testid={testId}>@{tag}</span>
}

/**
 * A full-width panel with a header bar that opens and closes it; several can be open at once. Collapsed, the bar shows a
 * one-line summary. `actions` sit at the bar's right and stay visible either way.
 */
export function Panel({ id, title, summary, open, onToggle, actions, children }: {
  id: string; title: string; summary: ReactNode; open: boolean; onToggle: () => void; actions?: ReactNode; children: ReactNode
}) {
  return (
    <section className={`sd-panel${open ? ' open' : ''}`} data-testid={`panel-${id}`}>
      <div className="sd-ph">
        <button type="button" className="sd-pt" onClick={onToggle} aria-expanded={open} data-testid={`panel-${id}-toggle`}>
          <i className="sd-caret">{open ? '▾' : '▸'}</i><span className="sd-il">{title}</span>
          {!open && <span className="sd-sum" data-testid={`panel-${id}-summary`}>{summary}</span>}
        </button>
        {actions && <span className="sd-pa">{actions}</span>}
      </div>
      {open && <div className="sd-pb">{children}</div>}
    </section>
  )
}

/** the stage's labels switch: lime when on */
export function LabelsToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`sd-tgl${on ? ' on' : ''}`} onClick={onToggle} aria-pressed={on} data-testid="scene-labels">
      <span>Labels</span><i />
    </button>
  )
}

/** concept draws at full quality (Qwen-Image 2512, 50 steps) or as drafts (its Lightning 4-step LoRA); Cast fronts are not affected */
export function QualityToggle({ q, onChange }: { q: ConceptQuality; onChange: (q: ConceptQuality) => void }) {
  return (<>
    <div className="sd-seg sd-q" role="radiogroup" aria-label="Concept quality" data-testid="scene-quality"
      title={`Look images: full ≈ ${CONCEPT_CR.full} cr for one image and ${CONCEPT_MORE.full} more for each extra, draft ≈ ${CONCEPT_CR.draft} and ${CONCEPT_MORE.draft} more (people and creatures are Cast fronts either way)`}>
      {(['full', 'draft'] as const).map((k) => (
        <button type="button" role="radio" aria-checked={q === k} key={k} className={q === k ? 'on' : ''} onClick={() => onChange(k)} data-testid={`quality-${k}`}>
          {k === 'full' ? 'Full' : 'Draft'} <small>≈ {CONCEPT_CR[k]} cr</small>
        </button>
      ))}
    </div>
    <span className="sd-per">per image</span>
  </>)
}

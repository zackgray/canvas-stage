// The draw screen's candidates (add-prop-review, owner 2026-10-29): what Draw (or an upload) brought back shows right here in the
// Add dialog. One large photograph — the selected candidate — opens the app's one viewer (Lightbox) on a click; the thumbnails
// under it only choose which one is shown large (click, or the arrow keys on the strip) and never open the viewer, place or build.
// Use this one (its 3D build's price said on the press, since approving starts that one build) places the selected candidate; the
// viewer offers the same press. Draw another candidate draws one more with the same words, at its own price, and selects it.
// While a candidate is being placed every press waits; a refusal is said in plain words by the screen above.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Lightbox, PriceButton, RunPill, STILL_ESTIMATE } from '../ui'
import type { FreshLook } from './freshLooks'

export interface AddGenPicksProps {
  looks: FreshLook[]
  /** the candidate selected first (a card picked in the list behind); else the newest */
  start?: number
  /** the 3D build's price (the pieces route's); null = not read yet */
  buildPrice?: number | null
  /** the one draw's price (a single candidate) */
  againPrice: number
  /** a draw or a placement is running: every press waits */
  busy: boolean
  /** the look being placed now (its press reads Placing it…) */
  placing: string | null
  drawing: boolean
  onUse: (look: FreshLook) => void
  onAgain: () => void
  /** the draw words are empty (cleared under ADVANCED): Draw another waits for words */
  noWords?: boolean
}

export function AddGenPicks({ looks, start, buildPrice, againPrice, busy, placing, drawing, onUse, onAgain, noWords }: AddGenPicksProps) {
  const [sel, setSel] = useState(start ?? Math.max(0, looks.length - 1))
  const [viewer, setViewer] = useState<number | null>(null)
  // a new candidate (Draw another, an upload) is selected as it lands
  const count = useRef(looks.length)
  useEffect(() => { if (looks.length > count.current) setSel(looks.length - 1); count.current = looks.length }, [looks.length])
  if (!looks.length && !drawing) return null
  const build = typeof buildPrice === 'number' ? buildPrice : null
  const i = Math.min(sel, looks.length - 1)
  const shown = looks[i] ?? null
  const step = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d || !looks.length) return
    e.preventDefault()
    const n = (i + d + looks.length) % looks.length
    setSel(n)
    ;(e.currentTarget.querySelectorAll<HTMLElement>('button')[n])?.focus()
  }
  return (
    <div className="st-field" data-testid="add-gen-picks">
      <span>{looks.length ? 'Pick the one to use' : 'Drawing…'}</span>
      {shown && (
        <div className="ad-pick" data-testid="add-gen-shown">
          <button type="button" className="ad-pick-view" aria-label={`See candidate ${i + 1} large`} title="Click to see it large"
            onClick={() => setViewer(i)} data-testid="add-gen-shown-view">
            <img src={shown.url} alt={`Candidate ${i + 1}`} data-testid="add-gen-shown-img" />
          </button>
          <PriceButton primary verb={placing === shown.url ? 'Placing it…' : 'Use this one'} price={build} disabled={busy}
            title="Places it at the marked spot and builds it in 3D once (about a minute)" onClick={() => onUse(shown)} testId="add-gen-use" />
        </div>
      )}
      {(looks.length > 1 || drawing) && (
        <div className="ad-thumbs" role="listbox" aria-label="Candidates" onKeyDown={step} data-testid="add-gen-thumbs">
          {looks.map((f, k) => (
            <button key={`${k}:${f.url}`} type="button" role="option" aria-selected={k === i} className={`ad-thumb${k === i ? ' on' : ''}`}
              aria-label={`Candidate ${k + 1}`} onClick={() => setSel(k)} data-testid={`add-gen-thumb-${k}`}>
              <img src={f.url} alt="" />
            </button>
          ))}
          {drawing && <span className="ad-thumb ad-pick-wait" data-testid="add-gen-pick-wait"><RunPill label="Drawing…" estimate={STILL_ESTIMATE} price={againPrice} /></span>}
        </div>
      )}
      {looks.length > 0 && (
        <p className="st-muted" data-testid="add-gen-picks-hint">
          Use this one places it at the marked spot with its label and builds it in 3D, about a minute{build !== null ? `, about ${Math.round(build)} cr` : ''}.
          The others stay in the list as alternates.
        </p>
      )}
      {looks.length > 0 && (
        <span><PriceButton verb="Draw another candidate" price={againPrice} disabled={busy || noWords} onClick={onAgain} testId="add-gen-again"
          title={noWords ? 'The words under ADVANCED are empty' : 'The same words, one more candidate'} /></span>
      )}
      <Lightbox items={looks.map((f, k) => ({ src: f.url, label: `${f.name} · candidate ${k + 1}` }))} index={viewer} onIndex={(k) => { setViewer(k); setSel(k) }} onClose={() => setViewer(null)}
        aside={viewer !== null && looks[viewer] && (
          <span className="oc-lb-aside">
            <PriceButton primary verb="Use this one" price={build} disabled={busy} testId="add-gen-lightbox-use"
              onClick={() => { const f = looks[viewer]; setViewer(null); onUse(f) }} />
          </span>
        )} />
    </div>
  )
}

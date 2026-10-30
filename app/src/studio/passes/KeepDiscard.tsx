import { useState } from 'react'
import type { PassCandidate } from '../../shared/passContract'
import { Elapsed } from '../ui'
import { formatPrice } from '../ui/format'
import './passes.css'

const WHAT: Record<PassCandidate['pass'], string> = { prop: 'Prop redraw', face: 'Face redraw', facePass: 'Face detail pass' }

export interface KeepDiscardProps {
  candidate: PassCandidate
  onKeep: () => void
  onDiscard: () => void
  /** free: fetch the paid job by id; never resubmits */
  onRecover: () => void
  /** a call for this candidate is out */
  busy?: boolean
}

/** One crop at its own pixels: never scaled down, the box scrolls instead, so a flaw the size of a pixel cannot be hidden by a thumbnail. */
function Crop({ label, url, onLoad }: { label: string; url: string | null; onLoad?: () => void }) {
  return (
    <figure className="st-pass-crop">
      <figcaption>{label}</figcaption>
      <div className="st-pass-frame">
        {url ? <img src={url} alt={label} onLoad={onLoad} data-testid={`pass-${label.toLowerCase()}`} /> : <span className="st-muted">No crop was saved.</span>}
      </div>
    </figure>
  )
}

/** The Keep / Discard card of a pass candidate: before beside after at 100 %, what was redrawn, what it cost. Keep stays off until both crops have loaded at full size. */
export function KeepDiscard({ candidate: c, onKeep, onDiscard, onRecover, busy }: KeepDiscardProps) {
  const [seen, setSeen] = useState({ before: false, after: false })
  const price = formatPrice(c.costCredits ?? null)
  const title = `${WHAT[c.pass]}: ${c.subject}`
  if (c.state === 'running') {
    return (
      <section className="st-pass" data-testid="pass-running">
        <h4>{title}</h4>
        <p className="st-muted">Redrawing… <Elapsed since={Date.parse(c.createdAt)} />{price ? ` · ${price}` : ''}</p>
        {c.jobId && <button type="button" className="st-btn" onClick={onRecover} disabled={busy} data-testid="pass-recover">Check the job</button>}
      </section>
    )
  }
  if (c.state === 'failed') {
    return (
      <section className="st-pass" data-testid="pass-failed">
        <h4>{title}</h4>
        <p className="st-warn" data-testid="pass-error">{c.error ?? 'The pass failed.'}</p>
        {c.jobId
          ? <button type="button" className="st-btn" onClick={onRecover} disabled={busy} data-testid="pass-recover" title="Fetches the job that was already billed. Nothing is sent again.">Recover</button>
          : <p className="st-muted">It never reached the paid step, so nothing was spent.</p>}
      </section>
    )
  }
  if (c.state === 'kept' || c.state === 'discarded') {
    return <section className="st-pass st-pass-done" data-testid={`pass-${c.state}`}><h4>{title}</h4><p className="st-muted">{c.state === 'kept' ? 'Kept. The earlier image is still on disk.' : 'Discarded.'}</p></section>
  }
  const looked = seen.before && seen.after
  return (
    <section className="st-pass" data-testid="pass-candidate">
      <h4>{title}{price && <span className="st-price"> {price} paid</span>}</h4>
      <div className="st-pass-pair">
        <Crop label="Before" url={c.beforeCropUrl} onLoad={() => setSeen((s) => ({ ...s, before: true }))} />
        <Crop label="After" url={c.afterCropUrl} onLoad={() => setSeen((s) => ({ ...s, after: true }))} />
      </div>
      <p className="st-muted">Shown at 100 %, {c.box.w}×{c.box.h} px. Scroll a crop to see all of it.</p>
      <div className="st-pass-actions">
        <button type="button" className="st-btn st-primary" onClick={onKeep} disabled={busy || !looked} data-testid="pass-keep"
          title={looked ? 'Make this the approved image. The earlier one stays on disk.' : 'Keep unlocks once both crops are showing at full size.'}>Keep</button>
        <button type="button" className="st-btn" onClick={onDiscard} disabled={busy} data-testid="pass-discard" title="Free. Nothing changes.">Discard</button>
      </div>
    </section>
  )
}

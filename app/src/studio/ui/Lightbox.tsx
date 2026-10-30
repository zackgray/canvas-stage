import { useEffect, useState, type ReactNode } from 'react'
import './lightbox.css'

export interface LightboxItem { src: string; label?: string }
export interface LightboxProps {
  items: readonly LightboxItem[]
  /** the item shown; null = closed */
  index: number | null
  onIndex: (i: number) => void
  onClose: () => void
  /** a reference (the clay view): "Compare" flips the shown image to it and back, same size and place */
  compare?: LightboxItem
  /** open each image already flipped to the reference (a "Compare" button elsewhere opened it) */
  startCompare?: boolean
  /** a panel under the image for the shown item (the still judge); clicks in it never close the lightbox */
  aside?: ReactNode
}

/** A full-size viewer for any generated image: ←/→ (or the arrows) between items, Escape or a click outside closes, Compare flips to a reference. */
export function Lightbox({ items, index, onIndex, onClose, compare, startCompare, aside }: LightboxProps) {
  const [flip, setFlip] = useState(false)
  const n = items.length
  const at = index === null || n === 0 ? null : Math.min(Math.max(index, 0), n - 1)
  useEffect(() => { setFlip(!!startCompare) }, [at, startCompare])
  useEffect(() => {
    if (at === null) return
    const go = (d: number) => onIndex((at + d + n) % n)
    // capture + stopImmediatePropagation: while open the lightbox owns the keyboard, so the studio's stage hotkeys never see it
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      e.stopImmediatePropagation()
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && n > 1) go(-1)
      else if (e.key === 'ArrowRight' && n > 1) go(1)
      else if ((e.key === 'c' || e.key === 'C') && compare) setFlip((f) => !f)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [at, n, onIndex, onClose, compare])
  if (at === null) return null
  const shown = flip && compare ? compare : items[at]
  return (
    <div className={`st-lightbox${aside ? ' st-lightbox-judge' : ''}`} role="dialog" aria-modal="true" aria-label="Full size image" data-testid="lightbox" onClick={onClose}>
      <img src={shown.src} alt={shown.label ?? 'full size'} data-testid="lightbox-img" onClick={(e) => e.stopPropagation()} />
      <div className="st-lb-bar" onClick={(e) => e.stopPropagation()}>
        {n > 1 && <button type="button" className="st-btn" onClick={() => onIndex((at - 1 + n) % n)} aria-label="Previous image" data-testid="lightbox-prev">‹</button>}
        <span className="st-lb-cap" data-testid="lightbox-label">{shown.label ?? ''}{n > 1 && !flip ? ` · ${at + 1} of ${n}` : ''}</span>
        {compare && <button type="button" className={`st-btn${flip ? ' st-primary' : ''}`} aria-pressed={flip} onClick={() => setFlip((f) => !f)} title="Flip to the reference and back (C)" data-testid="lightbox-compare">
          {flip ? `Back to the image` : `Compare with ${compare.label ?? 'the reference'}`}</button>}
        {n > 1 && <button type="button" className="st-btn" onClick={() => onIndex((at + 1) % n)} aria-label="Next image" data-testid="lightbox-next">›</button>}
        <button type="button" className="st-btn" onClick={onClose} aria-label="Close" data-testid="lightbox-close">Close</button>
      </div>
      {aside && <div className="st-lb-aside" onClick={(e) => e.stopPropagation()}>{aside}</div>}
    </div>
  )
}

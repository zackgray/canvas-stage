import { useRef, type KeyboardEvent } from 'react'
import './candidateStrip.css'

export interface StripAction {
  id: string
  label: string
  primary?: boolean
  disabled?: boolean
  title?: string
}

export interface StripItem {
  id: string
  src: string | null
  label: string
  reason?: string
  /** still being drawn: placeholder instead of the image, no actions */
  pending?: boolean
  /** the source changed since this was generated */
  stale?: boolean
  actions?: StripAction[]
}

export interface CandidateStripProps {
  items: StripItem[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  onAction?: (itemId: string, actionId: string) => void
  /** view large (opens the lightbox) */
  onOpen?: (id: string) => void
  /** drawn first no matter its place in `items` (the clay view) */
  leadingId?: string
  emptyText?: string
  testId?: string
}

/** A horizontally scrollable row of candidate cards — thumbnail, caption, actions — under a stage. */
export function CandidateStrip({ items, selectedId, onSelect, onAction, onOpen, leadingId, emptyText, testId = 'candidate-strip' }: CandidateStripProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  if (items.length === 0) return emptyText ? <p className="st-strip-empty">{emptyText}</p> : null
  // the leading card (the clay view) goes first; the rest keep their order
  const ordered = leadingId ? [...items.filter((i) => i.id === leadingId), ...items.filter((i) => i.id !== leadingId)] : items
  // ←/→ move between thumbnails; nothing wraps so focus stays where the strip ends
  const stepFocus = (e: KeyboardEvent<HTMLButtonElement>, dir: 1 | -1) => {
    const thumbs = Array.from(rowRef.current?.querySelectorAll<HTMLButtonElement>('.st-strip-thumb') ?? [])
    const at = thumbs.indexOf(e.currentTarget) + dir
    if (at >= 0 && at < thumbs.length) {
      e.preventDefault()
      thumbs[at].focus()
    }
  }
  return (
    <div className="st-strip" ref={rowRef} data-testid={testId}>
      {ordered.map((item) => {
        const selected = item.id === selectedId
        return (
          <div className={`st-strip-card${selected ? ' st-strip-selected' : ''}`} key={item.id} data-testid={`${testId}-card-${item.id}`}
            aria-current={selected ? 'true' : undefined}>
            <button type="button" className="st-strip-thumb" aria-label={item.label}
              onClick={() => {
                onOpen?.(item.id)
                onSelect?.(item.id)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') stepFocus(e, 1)
                else if (e.key === 'ArrowLeft') stepFocus(e, -1)
              }}>
              {item.src && !item.pending
                ? <img src={item.src} alt={item.label} />
                : <span className="st-strip-ph">{item.pending ? <>{item.label}<span>drawing…</span></> : item.label}</span>}
            </button>
            <span className="st-strip-cap">{item.label}</span>
            {item.reason && <span className="st-strip-reason">{item.reason}</span>}
            {item.stale && <span className="st-strip-badge">out of date</span>}
            {!item.pending && (item.actions?.length ?? 0) > 0 && (
              <span className="st-strip-acts">
                {item.actions!.map((a) => (
                  <button type="button" className={`st-btn${a.primary ? ' st-primary' : ''}`} key={a.id} disabled={a.disabled} title={a.title}
                    data-testid={`${testId}-action-${item.id}-${a.id}`}
                    onClick={() => {
                      if (a.disabled) return
                      onAction?.(item.id, a.id)
                    }}>{a.label}</button>
                ))}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// The object card (object card wave, the approved mock mock-2026-10-28-object-card): ONE dialog for a person and a prop alike,
// centred over a dimmed viewport like the first-words card (its focus-trap pattern: the dim blocks the mouse, Tab cycles inside,
// Escape closes). Opened by clicking the thing in the viewport (the panel host opens it on the pick) or from the right panel; the
// ✕, the dimmed backdrop or Escape closes it, and deselecting the thing closes it with the selection. Header: the kind, the name
// (editable for both kinds), the close. Tabs LOOK and ADVANCED only — size, turn and the walk cycle stay in the right panel and
// the viewport, and the right-click menu is a later track. Nothing here spends; every priced press lives in a tab's body.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './objectCard.css'

export type CardTab = 'look' | 'advanced'

export interface ObjectCardProps {
  kind: 'person' | 'prop'
  /** the header name; editable only while onRename is given */
  name: string
  onRename?: (v: string) => void
  namePlaceholder?: string
  look: ReactNode
  advanced: ReactNode
  /** the tab it opens on (the piece panel's Advanced… opens it straight there) */
  startTab?: CardTab
  onClose: () => void
}

/** the one card over the viewport for the picked person or prop */
export function ObjectCard({ kind, name, onRename, namePlaceholder, look, advanced, startTab, onClose }: ObjectCardProps) {
  const [tab, setTab] = useState<CardTab>(startTab ?? 'look')
  const card = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)
  // the card holds the focus like the first-words card: the first field is focused when it opens, Tab cycles inside it, Escape closes
  useEffect(() => {
    if (!wasOpen.current) {
      wasOpen.current = true
      card.current?.querySelector<HTMLElement>('textarea, input, button')?.focus()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose()
      if (e.key !== 'Tab') return
      const els = [...(card.current?.querySelectorAll<HTMLElement>('textarea, input, select, button') ?? [])].filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true')
      if (!els.length) return
      const i = els.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey && i <= 0) { e.preventDefault(); els.at(-1)!.focus() }
      else if (!e.shiftKey && (i === -1 || i === els.length - 1)) { e.preventDefault(); els[0].focus() }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])
  return createPortal(
    <div className="st-obj-dim" data-testid="object-card-dim"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={card} className="st-obj-card" role="dialog" aria-modal="true" data-testid="object-card">
        <div className="oc-head">
          <div className="oc-head-main">
            <span className="oc-kind">{kind === 'person' ? 'Person' : 'Prop'}</span>
            {onRename
              ? <input className="oc-name" value={name} placeholder={namePlaceholder ?? 'Name'} aria-label="Name"
                  onChange={(e) => onRename(e.target.value)} data-testid="card-name" />
              : <h2 className="oc-title">{name}</h2>}
          </div>
          <button type="button" className="oc-x" data-testid="object-card-x" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="oc-tabs" role="tablist" aria-label="Card sections">
          {(['look', 'advanced'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} data-testid={`object-tab-${t}`}
              onClick={() => setTab(t)}>{t === 'look' ? 'LOOK' : 'ADVANCED'}</button>
          ))}
        </div>
        <div className="oc-body" data-testid="object-card-body">
          {tab === 'look' ? look : advanced}
        </div>
      </div>
    </div>, document.querySelector('[data-testid="studio-root"]') ?? document.body)
}

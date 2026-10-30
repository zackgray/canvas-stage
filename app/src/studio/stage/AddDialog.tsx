// The Add dialog (add-flow-no-home, owner 2026-10-28): right-click on empty ground > A prop / A set piece opens this, centred over
// a dimmed viewport exactly like the object card (same shell classes; the dim blocks the mouse, Tab cycles inside, Escape, the ✕ or
// the dim closes). It shows what the retired left strip showed in Add mode, from the same content hook (useRailContent): the kit's
// kinds, or the set's own props, the pictures drawn so far and "+ Generate a prop", whose screen (AddGenScreen) keeps its priced
// Draw button. A click on a card only places it at the marked spot (free); nothing is spent but by the Draw press. The screen's
// own Escape goes back to the cards (typed words are never thrown away by a stray key or click). (add-prop-review) The Escape is
// the dialog's alone (the Stage's own Escape used to drop the marked spot and close the dialog too, mid-draw), and it waits while
// a draw or a placement runs.
import { SET_READ_ONLY } from '../../labs/projection/stage3d/setEditGate'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import type { SetPlaceState } from '../scene/useSetPlace'
import { AddGenScreen } from './AddGenScreen'
import type { AddKind } from './railBus'
import type { FreshLook } from './freshLooks'
import type { RailCard } from './railModel'
import { useRailContent, type RailContentDeps } from './useRailContent'
import './panels/objectCard.css'
import './addDialog.css'

export interface AddDialogProps {
  lab: ProjectionLabState
  place: SetPlaceState
  /** the marked spot (metres) and what is being added */
  at: [number, number]
  kind: AddKind
  /** closes the dialog (and drops the mark); also what a placement calls */
  onClose: () => void
  /** tests: the routes (jsdom has none) */
  deps?: RailContentDeps
}

const say = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** the Add flow's dialog over the viewport */
export function AddDialog({ lab, place, at, kind, onClose, deps }: AddDialogProps) {
  // a locked take on show with its own other set: every add is off up front (a piece would land in the scene's set unseen)
  const locked = lab.kit?.ownSet ? SET_READ_ONLY : null
  const add = useMemo(() => ({ kind, at: [at[0], at[1]] as [number, number] }), [kind, at[0], at[1]]) // eslint-disable-line react-hooks/exhaustive-deps
  const content = useRailContent({ lab, pick: null, place, add, onPlaced: onClose, onClose, deps })
  // the draw screen: false, or open (with the drawn candidate picked in the list, when one was)
  const [gen, setGen] = useState<false | { looks: FreshLook[]; sel: number } | true>(false)
  // a draw or a placement in the draw screen: Escape and the dim wait for it (the dialog must not vanish mid-press)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const card = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)
  // the dialog holds the focus like the object card; Escape steps back from the draw screen first, then closes
  useEffect(() => {
    if (!wasOpen.current) { wasOpen.current = true; card.current?.querySelector<HTMLElement>('button')?.focus() }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // the dialog's own: the Stage's Escape (which drops the marked spot, and with it this dialog) never sees it
        e.stopPropagation()
        if (busy) return
        return gen ? setGen(false) : onClose()
      }
      if (e.key !== 'Tab') return
      const els = [...(card.current?.querySelectorAll<HTMLElement>('textarea, input, select, button') ?? [])].filter((el) => !el.hasAttribute('disabled'))
      if (!els.length) return
      const i = els.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey && i <= 0) { e.preventDefault(); els.at(-1)!.focus() }
      else if (!e.shiftKey && (i === -1 || i === els.length - 1)) { e.preventDefault(); els[0].focus() }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [gen, busy, onClose])
  const press = (c: RailCard) => {
    if (c.gen) { setGen(true); return }
    // a drawn candidate's card opens the review on it: a card never places or builds by itself, only Use this one does
    const drawn = content?.cards.filter((k) => k.id.startsWith('gen:') && k.img) ?? []
    const at = drawn.findIndex((k) => k.id === c.id)
    if (at >= 0 && content?.add?.approve) { setGen({ looks: drawn.map((k) => ({ url: k.img!, name: k.name, desc: k.desc, ...(k.parts ? { parts: k.parts } : {}) })), sel: at }); return }
    setError(null)
    c.apply?.().catch((e) => setError(say(e)))
  }
  const title = kind === 'prop' ? 'Add a prop' : 'Add a set piece'
  const shownError = error ?? content?.error ?? null
  return createPortal(
    <div className="st-obj-dim" data-testid="add-dialog-dim" onMouseDown={(e) => { if (e.target === e.currentTarget && !gen) onClose() }}>
      <div ref={card} className="st-obj-card" role="dialog" aria-modal="true" aria-label={title} data-testid="add-dialog">
        <div className="oc-head">
          <div className="oc-head-main">
            <span className="oc-kind">At the marked spot</span>
            <h2 className="oc-title">{title}</h2>
          </div>
          <button type="button" className="oc-x" data-testid="add-dialog-x" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="oc-body ad-body" data-testid="add-dialog-body">
          {gen && content?.add
            ? <AddGenScreen price={content.add.price} draw={content.add.draw} upload={content.upload} buildPrice={content.add.buildPrice}
                approve={content.add.approve} onBusy={setBusy} initial={typeof gen === 'object' ? gen : undefined} onClose={() => setGen(false)} />
            : (
              <>
                {content?.note && <p className="st-muted" data-testid="add-dialog-note">{content.note}</p>}
                <div className="ad-cards" data-testid="add-dialog-cards">
                  {content?.cards.map((c) => (
                    <button key={c.id} type="button" className={`ad-card${c.gen ? ' ad-gen' : ''}`} data-testid={`add-card-${c.id}`}
                      disabled={!!locked || (!c.gen && !c.apply)} title={locked ?? c.desc} onClick={() => press(c)}>
                      {c.img && <img src={c.img} alt="" />}
                      <b>{c.name}</b>
                      {c.fresh && <i className="ad-new">NEW</i>}
                    </button>
                  ))}
                </div>
              </>
            )}
          {shownError && <p className="st-warn" role="alert" data-testid="add-dialog-error">{shownError}</p>}
        </div>
      </div>
    </div>, document.querySelector('[data-testid="studio-root"]') ?? document.body)
}

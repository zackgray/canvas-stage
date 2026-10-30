import { useState } from 'react'
import type { KeyframeRole } from '../../shared/shotContract'
import { LAYOUT_WARNING, type KitStill } from '../../../server/hero/kitSpec'
import { STALE_START } from '../../shared/startKey'
import { Ask, Lightbox, PriceButton, type LightboxItem } from '../ui'
import { StillJudgePanel } from './StillJudge'

type Item = KitStill & { stale: boolean; staleWhy?: string }

const ROLE: Record<KeyframeRole, string> = { opening: 'Opening', mid: 'Mid', end: 'End' }
const ORDER: KeyframeRole[] = ['opening', 'mid', 'end']

/** "Mid · f96 · seed 7 · approved · carried over": what the lightbox caption says about a still */
export const stillLabel = (s: Item) =>
  [ROLE[s.role ?? 'opening'], ...(s.frame ? [`f${s.frame}`] : []), `seed ${s.seed}`, ...(s.approved ? ['approved'] : []), ...(s.carriedFrom ? ['carried over'] : []), ...(s.stale ? ['stale'] : [])].join(' · ')

/** the layout check flagged it: it may be missing the hero or have moved part of the set (kitSpec.ts LAYOUT_WARNING) */
const off = (s: Item): boolean => !!s.layout && !s.layout.ok

/** every still of the take in keyframe order (opening, mid, end), each keyframe's candidates newest first, as the lightbox walks them */
export const lightboxOrder = (all: Item[]): Item[] => ORDER.flatMap((r) => all.filter((s) => (s.role ?? 'opening') === r))

/**
 * The recent stills of the picked keyframe, newest first: thumbnail (click opens the full-size lightbox), badges, Approve. The
 * lightbox's arrows walk every still of the take (`all`: opening, mid and end and their candidates); Compare flips to the 3D set
 * frame the shown still was drawn on, where the clay has it (`clayOf`). (recipe wave) A still is never approved from its thumbnail:
 * Approve opens it full size with the still judge under it (StillJudge.tsx: each staged person at 100 % beside their card, the
 * priced face and prop redraws as Keep / Discard candidates), and approves there; a flagged still opens a confirm row first.
 */
export function HeroStrip({ stills, all, clayOf, onApprove, onUnapprove, disabled, redraw, onChanged, approveError }: {
  stills: Item[]; all?: Item[]; clayOf?: (s: Item) => LightboxItem | undefined; onApprove: (id: string) => void | Promise<void>; onUnapprove?: (id: string) => void; disabled?: boolean
  /** the server's refusal of the last approve, shown in the judge panel too (the lightbox covers the strip's own error line) */
  approveError?: string | null
  /** "Draw again with this seed" (troubleshooting item 8): the same seed with the card's current prompt, lock and refs, priced */
  redraw?: { price: number; onRedraw: (s: Item) => void }
  /** a Keep made a new still: read the take's stills again (an approved one's Keep re-reads them through onApprove) */
  onChanged?: () => void
}) {
  // the shown still by id, so a new still landing in the list (a Keep) does not move the lightbox to another one
  const [openId, setOpenId] = useState<string | null>(null)
  // Compare beside a layout warning opens the lightbox already flipped to the 3D set frame
  const [flip, setFlip] = useState(false)
  // un-approving asks first: Render needs an approved opening again
  const [undo, setUndo] = useState<string | null>(null)
  const walk = lightboxOrder(all ?? stills)
  if (!stills.length) return <p className="st-muted" data-testid="hero-empty">No stills yet.</p>
  const at = openId === null ? -1 : walk.findIndex((x) => x.id === openId)
  const shown = at >= 0 ? walk[at] : null
  const open = (s: Item) => setOpenId(s.id)
  const kept = (from: Item, id: string | null) => {
    if (!id) return
    if (from.approved) onApprove(id) // the approval already moved to it; approving again re-reads the strip
    else onChanged?.()
    setOpenId(id)
  }
  return (
    <>
      <ul data-testid="hero-strip" style={{ display: 'flex', gap: 8, overflowX: 'auto', listStyle: 'none', margin: 0, padding: 0 }}>
        {stills.map((s) => (
          <li key={s.id} data-testid={`hero-still-${s.id}`} style={{ flex: '0 0 auto', width: 168 }}>
            <button type="button" onClick={() => open(s)} title="Open full size (← → for the other stills)" data-testid={`hero-open-${s.id}`}
              style={{ display: 'block', padding: 0, border: 0, background: 'none', cursor: 'zoom-in', opacity: s.stale ? 0.55 : 1 }}>
              <img src={s.png} alt={`Still, seed ${s.seed}`} width={168} height={95} loading="lazy" style={{ display: 'block' }} />
            </button>
            <div className="st-muted" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {s.stale && <span className="st-warn" data-testid={`hero-stale-${s.id}`} title={s.staleWhy ?? STALE_START}>stale</span>}
              {off(s) && <span className="st-warn" data-testid={`hero-check-${s.id}`} title={`layout ${s.layout!.score.toFixed(2)}`}>check</span>}
              {/* one state: approved is a label, anything else opens the judge, where it is approved */}
              {s.approved
                ? undo === s.id
                  ? <Ask label="Undo approval of this still" yes="Undo approval" no="Keep it" testId={`hero-unapprove-ask-${s.id}`} onYes={() => { setUndo(null); onUnapprove?.(s.id) }} onNo={() => setUndo(null)}>
                    Render needs an approved opening still again.</Ask>
                  : <>
                    <strong data-testid={`hero-approved-${s.id}`}>approved</strong>
                    {onUnapprove && <button type="button" className="st-btn st-btn-quiet" disabled={disabled} data-testid={`hero-unapprove-${s.id}`} onClick={() => setUndo(s.id)}>Undo approval</button>}
                  </>
                : <button type="button" className={`st-btn${off(s) ? ' st-btn-quiet' : ''}`} disabled={disabled || s.stale} data-testid={`hero-approve-${s.id}`}
                  title={s.stale ? 'Stale stills cannot be approved: draw the frame again' : 'Opens it full size with each person at 100 % beside their card; approve it there'}
                  onClick={() => open(s)}>Judge &amp; approve…</button>}
            </div>
            {redraw && <PriceButton verb="Draw again with this seed" price={redraw.price} disabled={disabled} testId={`hero-redraw-${s.id}`}
              title={`Seed ${s.seed} again with the prompt, lock and references shown above, so a change is not seed luck`} onClick={() => redraw.onRedraw(s)} />}
          </li>
        ))}
      </ul>
      {stills.filter(off).map((s) => (
        <p key={s.id} className="st-warn" data-testid="hero-layout">
          {ROLE[s.role ?? 'opening']} still, seed {s.seed}: {LAYOUT_WARNING}{' '}
          {clayOf?.(s) && <button type="button" className="st-btn" data-testid={`hero-compare-${s.id}`} onClick={() => { setFlip(true); open(s) }}>Compare with the set frame</button>}
        </p>
      ))}
      <Lightbox items={walk.map((s) => ({ src: s.png, label: stillLabel(s) }))} index={shown ? at : null} onIndex={(i) => setOpenId(walk[i]?.id ?? null)} onClose={() => { setOpenId(null); setFlip(false) }}
        compare={shown && clayOf ? clayOf(shown) : undefined} startCompare={flip}
        aside={shown ? <StillJudgePanel key={shown.id} still={shown} disabled={disabled} onApprove={onApprove} approveError={approveError} onKept={(id) => kept(shown, id)} /> : undefined} />
    </>
  )
}

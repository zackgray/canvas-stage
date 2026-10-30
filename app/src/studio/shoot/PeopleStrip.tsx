import type { PersonStatus, RedrawPass } from '../../../server/hero/redrawSpec'
import { PriceButton } from '../ui'
import { Crop100 } from './Crop100'
import type { Judge } from './useStillJudge'

/** what each verdict says, in plain words (the match number is in the tooltip only) */
export const VERDICT: Record<PersonStatus, string> = {
  ok: 'On their mark.',
  off: 'Not where the 3D set puts them: missing, moved or drawn larger. Look at the crop before approving.',
  offscreen: 'Not in this frame on the 3D set.',
  unknown: 'The 3D set has no figure map for them at this frame, so nobody could check them.',
}
const flaggedOf = (s: PersonStatus) => s === 'off' || s === 'unknown'

export interface RedrawProps {
  judge: Judge
  /** the still's picture */
  src: string
  onRedraw: (pass: RedrawPass, subject: string) => void
  /** a redraw is being sent, or the still cannot take one (stale, already redrawn): the buttons are off */
  disabled?: boolean
  /** why the buttons are off, in plain words */
  why?: string
}

/** Each staged person at 100 % beside their cast card, the verdict, and "Redraw face from card" (priced). */
export function PeopleStrip({ judge, src, onRedraw, disabled, why }: RedrawProps) {
  if (!judge.people.length) return null
  return (
    <ul className="st-people" data-testid="people-strip">
      {judge.people.map((p) => (
        <li key={p.entity} className={`st-person${flaggedOf(p.status) ? ' st-person-flag' : ''}`} data-testid={`person-${p.entity}`}>
          <div className="st-person-pair">
            {p.box ? <Crop100 src={src} box={p.box} label={`${p.name} in the still`} testId={`person-crop-${p.entity}`} /> : <span className="st-muted st-person-none">No crop: not in this frame.</span>}
            {p.cardUrl
              ? <img className="st-person-card" src={p.cardUrl} alt={`${p.name}'s cast card`} style={{ height: Math.min(240, Math.max(96, p.box?.h ?? 160)) }} data-testid={`person-card-${p.entity}`} />
              : <span className="st-muted st-person-none">No cast card plays them.</span>}
          </div>
          <p className={flaggedOf(p.status) ? 'st-warn' : 'st-muted'} data-testid={`person-verdict-${p.entity}`} title={p.match !== null ? `outline match ${p.match.toFixed(2)}` : undefined}>
            <strong>{p.name}</strong> {VERDICT[p.status]}
          </p>
          {p.cardId && (
            <PriceButton verb="Redraw face from card" price={judge.prices.face} disabled={disabled || !p.face || !p.cardUrl} testId={`redraw-face-${p.entity}`}
              title={why ?? (!p.face ? 'The 3D set shows no face for them in this frame' : `Redraws only ${p.name}'s face from their card; the result comes back as a candidate to keep or discard`)}
              onClick={() => onRedraw('face', p.entity)} />
          )}
        </li>
      ))}
    </ul>
  )
}

/** Each set piece in view that has a board tile: its crop at 100 % beside the tile, and "Redraw from board tile" (priced). */
export function PieceStrip({ judge, src, onRedraw, disabled, why }: RedrawProps) {
  if (!judge.pieces.length) return null
  return (
    <ul className="st-people" data-testid="piece-strip">
      {judge.pieces.map((p) => (
        <li key={p.tag} className="st-person" data-testid={`piece-${p.tag}`}>
          <div className="st-person-pair">
            <Crop100 src={src} box={p.box} label={`@${p.tag} in the still`} testId={`piece-crop-${p.tag}`} />
            <img className="st-person-card" src={p.tileUrl} alt={`@${p.tag}'s board tile`} style={{ height: Math.min(240, Math.max(96, p.box.h)) }} />
          </div>
          <PriceButton verb="Redraw from board tile" price={judge.prices.prop} disabled={disabled} testId={`redraw-prop-${p.tag}`}
            title={why ?? `Redraws @${p.tag} from its board tile, inside its own outline only; the result comes back as a candidate to keep or discard`}
            onClick={() => onRedraw('prop', p.tag)} />
        </li>
      ))}
    </ul>
  )
}

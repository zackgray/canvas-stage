// The Describe-a-move form: the words box, the piece chips (the owner's props within reach, nearest first; out-of-reach ones
// carry their distance and answer with the refusal when picked), the ambiguity chips (pass 3: a chip only picks the kind of
// move — the words stay exactly as written), the trait note, and the Make it button. Nothing here sends anything until Make it — the plan is Track C's planMove, pure.
import { CLASS_LABELS, type MoveClass, type MovePlan } from '../../../stage3d/moves/index.ts'
import type { MotionHealth } from '../../../../server/motion/types'
import { BUSY_LINE, freeLine, PLACEHOLDER, WARMING_LINE } from './copy'
import { EXPERIMENTAL, HINT_LINE, HINT_MOVES, isFreeSpec } from './freeText'
import type { ReachPiece } from './pieces'

export interface MoveFormProps {
  pieces: ReachPiece[]
  pieceId: string | null
  setPieceId: (id: string | null) => void
  words: string
  setWords: (w: string) => void
  plan: MovePlan
  /** the words fit more than one kind of move: the kinds to pick from, and the one picked (null: none yet) */
  kinds?: readonly MoveClass[] | null
  kind?: MoveClass | null
  onKind?: (c: MoveClass) => void
  pending: boolean
  busyNotice: boolean
  health: MotionHealth | null
  /** the box's own seconds per try (the honest estimate under Make it), null until it says */
  secondsPerTry?: number | null
  onMake: () => void
}

export function MoveForm({ pieces, pieceId, setPieceId, words, setWords, plan, kinds = null, kind = null, onKind, pending, busyNotice, health, secondsPerTry = null, onMake }: MoveFormProps) {
  const spec = plan.kind === 'spec' ? plan.spec : null
  const toggle = (id: string) => setPieceId(pieceId === id ? null : id)
  return (
    <div className="st-move-form">
      <textarea className="st-input" data-testid="move-words" rows={3} value={words} onChange={(e) => setWords(e.target.value)} placeholder={PLACEHOLDER} />
      <span className="st-field-hint" data-testid="move-hint">{HINT_LINE}</span>
      <div className="bl-row" data-testid="move-hint-moves">
        {HINT_MOVES.map((m) => (
          <button key={m} type="button" className="st-btn" data-testid="move-hint-move" onClick={() => setWords(m)}>{m}</button>
        ))}
      </div>
      <span className="st-field-hint">Which piece is it about?</span>
      <div className="bl-row" data-testid="move-pieces">
        {pieces.map((p) => (
          <button key={p.id} type="button" className={pieceId === p.id ? 'st-btn bl-on' : 'st-btn'} data-testid={`move-piece-${p.id}`} onClick={() => toggle(p.id)}>
            {p.name}{p.reachable ? '' : ` · ${p.distance.toFixed(1)} m away`}
          </button>
        ))}
        <button type="button" className={!pieceId || pieceId === 'none' ? 'st-btn bl-on' : 'st-btn'} data-testid="move-piece-none" onClick={() => setPieceId('none')}>
          Nothing
        </button>
      </div>
      {kinds && (
        <div className="bl-row" data-testid="move-which">
          <span className="st-field-hint">Do you mean:</span>
          {kinds.map((c: MoveClass) => (
            <button key={c} type="button" className={kind === c ? 'st-btn bl-on' : 'st-btn'} aria-pressed={kind === c} data-testid={`move-which-${c}`} onClick={() => onKind?.(c)}>
              {CLASS_LABELS[c]}
            </button>
          ))}
        </div>
      )}
      {isFreeSpec(spec) && <b className="st-field-hint" data-testid="move-experimental">{EXPERIMENTAL}</b>}
      {plan.kind === 'spec' && plan.note && <span className="st-field-hint" data-testid="move-note">{plan.note}</span>}
      {plan.kind === 'refused' && <p className="bl-warn" data-testid="move-refused">{plan.message}</p>}
      {busyNotice && <p className="bl-warn" data-testid="move-busy">{BUSY_LINE}</p>}
      {health === 'busy' && !busyNotice && <p className="st-field-hint" data-testid="move-busy-line">{BUSY_LINE}</p>}
      {health === 'warming' && <p className="st-field-hint" data-testid="move-warming">{WARMING_LINE}</p>}
      <div className="bl-row">
        <button type="button" className="st-btn st-primary" data-testid="move-make" disabled={!spec || pending || health === 'warming' || health === 'offline' || health === 'off'}
          onClick={onMake}>
          Make it
        </button>
        <span className="st-field-hint" data-testid="move-free">{freeLine(secondsPerTry)}</span>
      </div>
    </div>
  )
}

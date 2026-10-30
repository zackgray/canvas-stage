// The Describe-a-move panel (plan section 5, Track E): the user writes what the person does at this path point and picks the
// Set piece it involves; the motion computer makes the move and the best try comes back as one move with Play here / Use this one.
// Not a modal — the 3D view stays live, and the panel's own waits are all polling. Copy lives in copy.ts and never names the
// generator: the one term is "motion computer". States: off / offline / warming / busy / making / results / failed / lost / refused.
import { useEffect, useMemo, useState } from 'react'
import type { KitItem } from '../../../stage3d/contract'
import { planMove, type MoveClass, type MovePlan, type MoveSpec } from '../../../stage3d/moves/index.ts'
import type { BoxTry } from '../../../../server/motion/types'
import { BUSY_LINE, MORE_FAILED_LINE, OFF_LINE, OFFLINE_LINE } from './copy'
import { FallbackRow, READY_MADE, type FallbackMove } from './FallbackRow'
import { JobBlock } from './JobBlock'
import { MoveForm } from './MoveForm'
import { namedPiece, reachPieces } from './pieces'
import { withFreeText } from './freeText'
import { useMotionComputer } from './useMotionComputer'

/** a try the user picked, handed to the join's callbacks: the kept clip plus what the action row needs */
export interface PickedMove {
  /** as the library loader sees it: "gen:<motion-id>" */
  clipId: string
  /** the clip record (clip.json: out, hold, prop grab/release, phases) */
  clip: Record<string, unknown>
  /** the user's own words for the action list */
  words: string
  /** the spec the try was made from; undefined for a job picked up from before this panel opened (the clip record still carries out/hold) */
  spec?: MoveSpec
}

export interface DescribeMovePanelProps {
  /** the picked path point's ground spot, world [x, z] */
  at: [number, number]
  /** the approved Set's pieces (the chips and the piece measure both come from these) */
  kit: readonly KitItem[]
  /** the hero's name or pronoun for the heading; "the subject" with no tag */
  who?: string
  /** Play here: audition this try in the main 3D view at this point, on the clay figure with the piece (join wires playback) */
  onPlayHere?: (picked: PickedMove) => void
  /** Use this one: the move is placed as the action at this point (join wires placement) */
  onUseThisOne?: (picked: PickedMove) => void
  /** a ready-made move from the fallback row (join places the library action) */
  onFallback?: (move: FallbackMove) => void
  /** job poll cadence ms (tests); the box probe itself is cached server-side */
  pollMs?: number
  /** whose move it is (the kit world, whose one hero it is for): her make's result is kept with the server's in-flight record, so
   *  it is shown again after she is deselected, the view switches or the page reloads, until it is used or discarded. Unset:
   *  whatever make is on record */
  owner?: string
}

export function DescribeMovePanel({ at, kit, who = 'the subject', onPlayHere, onUseThisOne, onFallback, pollMs, owner }: DescribeMovePanelProps) {
  const mc = useMotionComputer(pollMs)
  // her make (another person's make on record is not hers to show)
  const mine = mc.job && (owner === undefined || mc.job.owner === owner) ? mc.job : null
  const [words, setWords] = useState('')
  const [pieceId, setPieceId] = useState<string | null>(null)
  const [pending, setPending] = useState(false) // a make/keep call is in flight
  const [busyNotice, setBusyNotice] = useState(false) // the make was refused: the box's queue of 1 is full
  const [moreWhy, setMoreWhy] = useState<string | null>(null) // why Try another's fresh round did not start, in plain words
  const [keepError, setKeepError] = useState(false)
  const [lastSpec, setLastSpec] = useState<MoveSpec | null>(null)

  const pieces = useMemo(() => reachPieces(kit, at), [kit, at])
  // until a chip is pressed, the piece the words name (exactly one) is the one picked
  const named = useMemo(() => namedPiece(words, pieces), [words, pieces])
  const chosen = pieceId ?? named
  // new words that no longer name it keep the piece they named
  const editWords = (w: string) => { if (pieceId === null && named && namedPiece(w, pieces) !== named) setPieceId(named); setWords(w) }
  const piece = chosen && chosen !== 'none' ? pieces.find((p) => p.id === chosen) ?? null : null
  // words that fit two kinds of move ask "Do you mean"; the chip picks the kind for these words only, never rewriting them
  const kinds = useMemo(() => { const p = words.trim() ? planMove({ words }) : null; return p?.kind === 'chips' ? p.chips : null }, [words])
  const [picked, setPicked] = useState<{ cls: MoveClass; words: string } | null>(null)
  const kind = kinds && picked && picked.words === words && kinds.includes(picked.cls) ? picked.cls : null
  const plan: MovePlan = useMemo(() => {
    if (!words.trim()) return { kind: 'unknown' }
    // words the verb table does not know go through as free text (experimental)
    return withFreeText(planMove({ words, piece: piece ? { id: piece.id, name: piece.name, box: piece.box } : undefined, at: [at[0], 0, at[1]], ...(kind ? { cls: kind } : {}) }), words)
  }, [words, piece, at, kind])
  const spec = plan.kind === 'spec' ? plan.spec : null
  // her words come back with the result after a reload, and its spec makes a fresh round from Try another
  useEffect(() => { if (mine?.words) setWords((w) => w || mine.words!) }, [mine?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const known = spec ?? lastSpec ?? ((mine?.spec as MoveSpec | undefined) ?? null)

  const make = async (n?: number) => {
    const s = known
    if (!s || pending) return
    setPending(true); setBusyNotice(false); setKeepError(false); setMoreWhy(null)
    const r = await mc.make(s, n, { ...(owner ? { owner } : {}), ...(words.trim() ? { words: words.trim() } : {}) })
    setPending(false)
    if (r.ok) setLastSpec(s)
    else {
      if (r.busy) setBusyNotice(true)
      // the result stays on show, so say why nothing new started right under Try another
      setMoreWhy(r.busy ? BUSY_LINE : MORE_FAILED_LINE)
    }
  }

  /** keep the try (the plugin route that downloads it), then hand it to the join callback; a failed download shows Try again */
  const pick = async (t: BoxTry, use: ((picked: PickedMove) => void) | undefined) => {
    if (pending) return
    setPending(true); setKeepError(false)
    const label = words.trim() || mine?.words || 'made move'
    const kept = await mc.keep(t.id, label)
    setPending(false)
    if (!kept) { setKeepError(true); return }
    use?.({ clipId: kept.id, clip: kept.clip, words: label, spec: known ?? undefined })
    if (use && use === onUseThisOne) void mc.discard() // she has her move: the result is done with
  }

  const form = (
    <MoveForm {...{ pieces, pieceId: chosen, setPieceId, words, setWords: editWords, plan, kinds, kind, onKind: (cls: MoveClass) => setPicked({ cls, words }), pending, busyNotice, health: mc.health, secondsPerTry: mc.secondsPerTry, onMake: () => void make() }} />
  )
  const gate = mine
    ? <JobBlock mc={mc} job={mine} pending={pending} moreWhy={moreWhy} keepError={keepError} onPick={pick} onMore={(n) => void make(n)} onDismiss={() => void mc.discard()} canMore={!!known}
        onPlayHere={onPlayHere} onUseThisOne={onUseThisOne} onFallback={onFallback} />
    : mc.health === 'off'
      ? <><p className="st-field-hint" data-testid="move-off">{OFF_LINE}</p><FallbackRow onFallback={onFallback} ready={READY_MADE} /></>
      : mc.health === 'offline'
        ? <><p className="st-field-hint" data-testid="move-offline">{OFFLINE_LINE}</p>
          <div className="bl-row"><button type="button" className="st-btn" data-testid="move-check" onClick={() => void mc.checkAgain()}>Check again</button></div>
          <FallbackRow onFallback={onFallback} ready={READY_MADE} /></>
        : form

  return (
    <div className="st-scene" data-testid="describe-move-panel">
      <section className="st-scene-card">
        <h2>What does {who} do here?</h2>
        {gate}
      </section>
    </div>
  )
}

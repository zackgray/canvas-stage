// The Stage's paid render, read once for the take card and the first-frame window (owner 10-29: Render clip lives in the window):
// the Render page's own primary (primaryFor) gated on the take the Camera panel reads (stageGate) and held while a 3D piece builds
// (pieceBuilding.ts); whether the words-only choice is due (WordsChoice.tsx: only the take's words moved since its first frame);
// and the Stage's draw press as that choice's Redraw. Every guard is the one the steps block had: one press at a time, the price,
// the stale-frame refusal, the job store and the ledger are the render store's and the server's.
import { useEffect, useRef } from 'react'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { overridePrompt } from '../render/l2rStore'
import { useSentEdits } from './sentEdits'
import { useCurrentTakeId } from '../shoot/currentTake'
import { useHeroPublished } from '../shoot/heroPublished'
import { againAside, useL2R, type L2RHook } from '../render/l2rModel'
import { renderRunning } from '../render/L2RBlock'
import { wordsChoiceDue, type RedrawPress } from '../render/WordsChoice'
import { primaryFor, type Primary } from '../screens/primaryAction'
import { holdForBuild, PIECE_BUILDING, usePieceBuilding } from './pieceBuilding'
import { stageGate } from './shotStep'

export interface StageRender {
  l: L2RHook
  /** the render press as the Render page computes it, for the take on show */
  p: Primary
  /** only the take's words changed since its first frame: the paid press is the choice of a redraw or the new words on this frame */
  choose: boolean
  /** the draw press as the choice's Redraw; null while it draws or is gone */
  redraw: RedrawPress | null
  building: boolean
  /** a paid render runs now */
  running: boolean
  /** a done render of the take on show (the card's clip thumbnail), else null */
  clip: L2RHook['current']
}

export function useStageRender(lab: ProjectionLabState): StageRender {
  const press = useHeroPublished()?.press ?? null
  const l = useL2R(lab.s.source)
  const building = usePieceBuilding(lab.kit?.id ?? null)
  const current = useCurrentTakeId()
  const p = holdForBuild(stageGate(primaryFor(l), current, l.state.takeId), building)
  const running = renderRunning(l)
  const choose = wordsChoiceDue(l, !running && (p.action === 'l2r' || againAside(l.facts)))
  const redraw: RedrawPress | null = press && !press.drawing ? { price: press.price, disabled: press.disabled || building, title: building ? PIECE_BUILDING : undefined, onPress: press.onPress } : null
  const mine = !!current && current === l.state.takeId
  const clip = mine && l.current?.status === 'done' && (l.current.finished || l.current.raw) ? l.current : null
  useRenderEdit(mine ? current : null)
  return { l, p, choose, redraw, building, running: mine && running, clip }
}

/** (owner 10-29) the render words edited in "What will be sent" for the take on show are the render's prompt override (sent as
 *  written, apart from @tag expansion, the override's own path): a change is applied at once; a take shown again reads its stored
 *  edit back; a take with none leaves an override typed on the Render page alone, but never keeps another take's edit */
function useRenderEdit(takeId: string | null) {
  const want = useSentEdits(takeId).render?.text ?? ''
  const applied = useRef<{ take: string; text: string } | null>(null)
  useEffect(() => {
    if (!takeId) return
    const prev = applied.current
    applied.current = { take: takeId, text: want }
    if (prev?.take === takeId && prev.text === want) return
    const readBack = prev?.take !== takeId
    if (readBack && !want && !prev?.text) return // nothing stored here and nothing of another take's to clear
    overridePrompt(want, !readBack)
  }, [takeId, want])
}

// The Describe-a-move join (track D2, docs/plan-kimodo-live.md section 5): Track E's button and panel wired to Blocking's
// draft. The button sits in the action row next to Stop · Look · Turn · Kneel · Lift a frame; the panel opens in place (not a
// modal — the 3D view stays live) with the picked point, the Set's kit pieces and the hero's tag. Use this one places the kept
// move through the usual blocking ops (it live-saves); Play here auditions it on the clay as one unsaved draft action
// (movePreview.ts); the ready-made fallbacks place the library moves, and the ones with no library clip stay disabled with the
// reason (FallbackRow). Closing the slot drops the audition.
import { useEffect, useState } from 'react'
import { DescribeMoveButton, DescribeMovePanel, type FallbackMove, type PickedMove } from '../../moves'
import { getMovePreview, setMovePreview } from '../../../../labs/projection/stage3d/movePreview'
import { tagOptions } from './bibleTags'
import type { Blocking } from './useBlocking'

export function DescribeMoveSlot({ b, point, pollMs, inline = false }: { b: Blocking; point: number | null; pollMs?: number
  /** the Stage's person panel: the box is always open (no button), so her made move is on show whenever she is picked */
  inline?: boolean }) {
  const [toggled, setOpen] = useState(false)
  const open = inline || toggled
  const pt = point !== null ? b.draft.path[point] : undefined
  const castId = b.draft.castId || b.saved.castId
  const who = tagOptions(b.bible, 'cast').find((t) => t.cardId === castId)?.label ?? undefined
  // leaving the slot drops the audition for this world (the saved performance comes back on the clay)
  useEffect(() => () => {
    const p = getMovePreview()
    if (p && p.worldId === b.world?.id) setMovePreview(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount-only cleanup
  }, [])
  if (!b.world) return null
  const use = (picked: PickedMove) => { if (point !== null) b.actions.addMove(point, picked); setOpen(false) }
  const play = (picked: PickedMove) => { if (point !== null) b.actions.previewMove(point, picked) }
  const fallback = (m: FallbackMove) => { if (m === 'lift') b.actions.add('lift'); setOpen(false) }
  return (
    <>
      {!inline && <DescribeMoveButton onClick={() => setOpen((o) => !o)} disabled={point === null || b.busy} />}
      {open && point !== null && pt && (
        <div className="bl-describe">
          <DescribeMovePanel at={pt} kit={b.world.plan.kit} who={who} pollMs={pollMs} owner={b.world.id}
            onUseThisOne={use} onPlayHere={play} onFallback={fallback} />
        </div>
      )}
    </>
  )
}

// The Describe-a-move "Play here" audition (track D2, docs/plan-kimodo-live.md section 5): a kept try played on the clay at the
// picked point without saving anything. The Blocking panel sets a draft performance — the world's saved one plus this one
// unsaved move action — and useKit offers it in place of the saved perf, so the existing performer path (usePerformance ->
// useMocap) builds and plays it exactly like a saved take. Nothing is written to performance.json; clearing the preview (another
// Play here, placing the move, or closing the panel) puts the saved performance back. A tiny module-level bus: the panel and
// useKit are far apart in the tree and the preview must survive the panel closing.
import type { KitPerformance } from '../../../../server/stage3d/types'

export type MovePreview = { worldId: string; perf: KitPerformance }

let current: MovePreview | null = null
const subs = new Set<() => void>()

/** show this draft performance on the clay (replaces any earlier preview); null puts the saved performance back */
export function setMovePreview(p: MovePreview | null): void {
  current = p
  for (const s of subs) s()
}

export const getMovePreview = (): MovePreview | null => current

/** subscribe to preview changes; returns the unsubscribe (useKit mounts this) */
export function onMovePreview(sub: () => void): () => void {
  subs.add(sub)
  return () => {
    subs.delete(sub)
  }
}

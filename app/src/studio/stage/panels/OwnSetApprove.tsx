// Review F1: while a locked take with its own set is on show, the set panel's Approve is for THAT set, by its key and by the take's
// name: approved when its key is among the world's approved keys (the server's setKeys list), and the press sends its key (the
// server accepts only the scene's key or a locked take's own). Approving it never moves the scene's approval.
import { takeName } from '../../shoot/takeKeeps'
import { useLockedTakes } from '../../shoot/worldTakes'
import { ApproveSet } from '../../scene/SetApprove'
import type { SceneState } from '../../scene/useScene'

/** the take on show's name for its set ("Take 2's set"), from the world's locked takes */
export function useOwnSetName(worldId: string | null, takeId: string | null): string | null {
  const takes = useLockedTakes(worldId)
  return takeId ? `${takeName(takes.find((x) => x.id === takeId) ?? { id: takeId })}'s set` : null
}

export function OwnSetApprove({ s, worldId, own }: { s: SceneState; worldId: string; own: { takeId: string; setKey: string } }) {
  const whose = useOwnSetName(worldId, own.takeId)!
  const shown = { ...s, setState: s.approvedKeys.includes(own.setKey) ? 'approved' as const : 'none' as const, approveSet: () => s.approveSet(own.setKey) }
  return <ApproveSet s={shown} whose={whose} />
}

/**
 * The set approval (Set step, phase 1): the owner approves the set as it stands, free, before anything is drawn from it. It is kept
 * beside the scene's sheet (bible/set-approval.json, never inside it: approving must not bump the sheet's version) as the set key Shoot already computes (src/studio/shoot/setKey.ts setKeyOf, a hash
 * of the kit plan) and the time. A piece built or moved changes the key, so the approval then reads stale. The server refuses the
 * master draw, the master preview and the hero-still press (409, before any spend) unless the set is approved at its current key;
 * the Set step reads the same state from the same two facts. Pure.
 */
export interface SetApproval { key: string; at: string }
export type SetApprovalState = 'none' | 'approved' | 'stale'

/** where the set stands: approved at this key, approved at an older one (stale), or never approved */
export function setApprovalState(approval: SetApproval | null | undefined, key: string | null): SetApprovalState {
  if (!approval || !key) return 'none'
  return approval.key === key ? 'approved' : 'stale'
}

export const SET_NOT_APPROVED = 'Approve the set first (free): every still and render is drawn from the set as it stands. Nothing was billed.'
export const SET_CHANGED = 'The set changed since you approved it. Approve it again (free) before anything is drawn. Nothing was billed.'

/** the plain refusal for a state, or null when the set is approved */
export const setRefusal = (s: SetApprovalState): string | null => (s === 'approved' ? null : s === 'stale' ? SET_CHANGED : SET_NOT_APPROVED)

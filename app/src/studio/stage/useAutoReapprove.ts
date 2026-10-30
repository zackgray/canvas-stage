// An approved set stays approved while it is edited on the Stage (pass 3): a piece moved, added or swapped, the sun turned — once
// the edits settle (about a second with no change), a set that WAS approved and now reads changed is approved again, free (the
// same route as the Approve press; nothing is drawn). A set never approved is left alone: that first approval is the owner's.
import { useEffect } from 'react'
import { KIT_CHANGED } from '../../labs/projection/stage3d/kitApi'
import { setApprovalState, SET_CHANGED, SET_NOT_APPROVED } from '../../shared/setApproval'
import { bibleApi, type BibleApi } from '../scene/bibleApi'

export const SETTLE_MS = 1000

export function useAutoReapprove(worldId: string | null, api: BibleApi = defaultApi, settle = SETTLE_MS): void {
  useEffect(() => {
    if (!worldId) return
    let t: ReturnType<typeof setTimeout> | null = null
    let stop = false
    const check = async () => {
      try {
        const r = await api.get(worldId)
        if (!stop && setApprovalState(r.setApproval, r.setKey ?? null) === 'stale') await api.approveSet(worldId)
      } catch { /* the set panel still offers Approve again */ }
    }
    const on = (e: Event) => {
      if ((e as CustomEvent<{ id?: string }>).detail?.id !== worldId) return
      if (t) clearTimeout(t)
      t = setTimeout(() => void check(), settle)
    }
    window.addEventListener(KIT_CHANGED, on)
    return () => { stop = true; if (t) clearTimeout(t); window.removeEventListener(KIT_CHANGED, on) }
  }, [worldId, api, settle])
}
const defaultApi = bibleApi()

/** a refusal because the set is not approved (or changed since): said with its one-press fallback */
export const isSetRefusal = (text: string | null | undefined): boolean => text === SET_NOT_APPROVED || text === SET_CHANGED

import { useMemo } from 'react'
import type { L2RMissing, L2RRender } from '../../shared/shotContract'
import { finish, isRenderBusy, pick, previewPrompt, priceOf, recover, refresh, render, setGrade, setHold, setKeyframe, setPrompt, setSeed, useL2RState, type L2RState } from './l2rStore'

export { priceOf, sendsKeys } from './l2rStore'

/** What the Render screen's primary button needs to know about the Layout-To-Render path (pure; renderSteps reads it). */
export interface L2RFacts {
  /** a locked take is picked and on disk */
  take: boolean
  /** its clay is exported, fresh and the take's length */
  clay: boolean
  /** its approved still is there and fresh */
  still: boolean
  /** the prompt a render sends is whole: the scene prompt names no unknown tag, or the owner wrote an override (M1) */
  prompt: boolean
  /** a raw render exists */
  rendered: boolean
  /** the newest render is finished */
  finished: boolean
  running: boolean
  /**
   * a render exists but the owner asked for a different one since: the seed or prompt was changed in Advanced, or another
   * still was approved. The primary button is then "Render again" (paid); otherwise it is Finish / Export and the one paid
   * button is the secondary "Render again" (againAside).
   */
  again: boolean
  /** only the take's words changed since its approved first frame was drawn: a paid render press becomes the choice of a redraw
   *  or the new words on this frame (wordsOnFrame.ts); absent = no */
  wordsChanged?: boolean
}

const CLAY = ['no_clay', 'clay_not_done', 'clay_stale', 'clay_frames', 'clay_set_moved']
/** why Render is off while the scene prompt names an unknown tag and no override is written (M1) */
export const L2R_UNKNOWN_TAG = 'The scene prompt names a tag no reference answers to: fix it in the words on the Stage, or write a prompt override.'

/** where the paid Render press lives (the Stage's first-frame window, owner 10-29): every line that sends the owner there says this */
export const pressRender = (verb: 'Render clip' | 'Render again' = 'Render clip'): string => `press ${verb} in the first frame's window on the Stage`

/** the render on show: the newest done one, else the newest of any state (a failure shows its recover) */
export function currentRender(s: L2RState): L2RRender | null {
  const rs = s.status?.renders ?? []
  return rs.find((r) => r.status === 'done') ?? rs[0] ?? null
}

/** the newest render that failed with a job id, whichever came after it: Cloud may have it (recover by id, free, never resubmits) */
export function lostRender(s: L2RState): L2RRender | null {
  return s.status?.renders?.find((r) => r.status === 'failed' && !!r.jobId && !r.raw && !r.interrupted) ?? null
}

export function l2rFacts(s: L2RState): L2RFacts {
  const missing: L2RMissing[] = s.status?.missing ?? []
  const cur = currentRender(s)
  return {
    take: !!s.status?.take, clay: !!s.status?.take && !missing.some((m) => CLAY.includes(m.code) || m.code === 'no_take'),
    still: !!s.status?.take && !missing.some((m) => m.code === 'no_still' || m.code === 'stale_still'),
    prompt: !missing.some((m) => m.code === 'unknown_tag') || !!s.prompt.trim(),
    rendered: cur?.status === 'done', finished: cur?.status === 'done' && !!cur.finished, running: isRenderBusy(s),
    again: cur?.status === 'done' && (s.dirty || (!!s.status?.still && s.status.still.id !== cur.stillId)),
    wordsChanged: missing.some((m) => m.code === 'words_changed'),
  }
}

/**
 * The secondary paid "Render again" beside the free Finish / Export: only on the L2R path, after a done render, and only when
 * the primary is not already the paid render. So exactly one paid button is ever on screen.
 */
export const againAside = (f: L2RFacts): boolean => f.take && f.clay && f.still && f.rendered && !f.again

/** the newest render that stopped before it reached Cloud (nothing billed): Render offers to run it again */
export function interruptedRender(s: L2RState): L2RRender | null {
  const r = s.status?.renders?.[0]
  return r && r.status === 'failed' && r.interrupted ? r : null
}

/** `worldId`: the world on the set (Render and Export pass it): only its locked takes are offered */

export function useL2R(worldId?: string | null) {
  const s = useL2RState(worldId)
  return useMemo(() => {
    const cur = currentRender(s)
    const finishingNow = !!cur && (s.status?.finishing ?? []).includes(cur.id)
    return {
      state: s, facts: l2rFacts(s), current: cur, lost: lostRender(s), finishingNow,
      price: priceOf(s), configured: s.status?.configured ?? false,
      pick, render, recover, refresh, finish, setPrompt, setSeed, setKeyframe, setGrade, setHold, previewPrompt,
    }
  }, [s])
}
export type L2RHook = ReturnType<typeof useL2R>

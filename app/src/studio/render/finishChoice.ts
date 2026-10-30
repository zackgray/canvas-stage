import { CLOSEUP_FROM_MM, HOLD_DEFAULT, type FinishRequest, type HoldPreset } from '../../shared/renderFinishContract'
import type { L2RRender, TakeRecord } from '../../shared/shotContract'
import { GRADE_DEFAULT } from './l2rExtra'

/**
 * The Render screen's choices that are not the paid press's alone: "Hold the clay" (sent with the press) and the finish's grade
 * switch (free, toggled after the render and followed by Finish again). A choice the owner has not touched follows what the
 * render recorded, so reopening a render never silently changes it. There is no depth of field in the finish. Pure; l2rStore keeps the state.
 */
export interface FinishPicks {
  /** null = the default for the take (hold) */
  hold: HoldPreset | null
  /** the grade strength once the owner touched the switch (null = off); `gradeTouched` false = follow the render */
  grade: number | null
  gradeTouched: boolean
}

export const NO_PICKS: FinishPicks = { hold: null, grade: null, gradeTouched: false }

/** wides hold the clay on stage 1 only; a take of 85 mm or longer opens on the close-up preset (the owner can change it) */
export const holdFor = (picks: FinishPicks, take: Pick<TakeRecord, 'focal'> | null | undefined): HoldPreset =>
  picks.hold ?? ((take?.focal ?? 0) >= CLOSEUP_FROM_MM ? 'closeup' : HOLD_DEFAULT)

/** the grade strength the finish will use (null = off): the owner's switch, else what the render recorded */
export function gradeFor(picks: FinishPicks, cur: L2RRender | null | undefined): number | null {
  if (picks.gradeTouched) return picks.grade
  const g = cur?.grade as { strength?: number } | null | undefined
  return g && !cur?.gradeOff ? g.strength ?? GRADE_DEFAULT : null
}

/** the body of POST /__lab/l2r/finish: what the owner touched; the rest follows the render's record */
export function finishBody(renderId: string, picks: FinishPicks, canGrade: boolean): FinishRequest {
  return { renderId, ...(picks.gradeTouched && (canGrade || picks.grade === null) ? { grade: picks.grade === null ? false : { strength: picks.grade } } : {}) }
}

/** the grade switch differs from what the last finish applied (so "Finish again" has something to do) */
export function finishPending(picks: FinishPicks, cur: L2RRender | null | undefined): boolean {
  const applied = cur?.grade && !cur.gradeOff ? ((cur.grade as { strength?: number }).strength ?? GRADE_DEFAULT) : null
  return gradeFor(picks, cur) !== applied
}

/** what the finish applies, in words, for the note while it runs: the sharpen and the grain always */
export function finishWords(picks: FinishPicks, cur: L2RRender | null | undefined): string {
  return [...(gradeFor(picks, cur) !== null ? ['grade'] : []), 'sharpen', 'grain'].join(', ')
}

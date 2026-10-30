import type { L2RHook } from '../render/l2rModel'
import { L2R_UNKNOWN_TAG } from '../render/l2rModel'
import { NO_COMFY_TARGET } from '../../shared/shotContract'
import { currentSceneId } from '../../library/currentScene'
import { studioHash } from '../route'
import { nextAction, type NextAction } from './renderSteps'

export interface Primary {
  action: NextAction
  verb: string
  /** credits, 0 = free, null = no price (a link, or nothing to press) */
  price: number | null
  disabled: boolean
  /** a sentence under the button saying why it is off, or null */
  why: string | null
  run: () => void
}

export const L2R_NEEDS_STILL = 'Draw the first frame and pick a version first.'
/** Render with no locked take (or no prepared frames): the empty state, never a paid button (QA 2026-10-25) */
export const KIT_NEEDS_TAKE = 'Lock a take first.'
export const KIT_NEEDS_FRAMES = 'Draw the first frame and pick a version first.'

/** What the primary reads of the Layout-To-Render hook. */
export type PrimaryL2R = Pick<L2RHook, 'facts' | 'price' | 'configured' | 'current' | 'finishingNow' | 'state' | 'render' | 'finish'>

/**
 * The one primary button of the Render stage: the Layout-To-Render pass of a locked take with its clay (Render, then the free
 * Finish, then Export), with its price and, when it cannot run, the reason. The server still has the last word (budget, one job at a time).
 */
export function primaryFor(l: PrimaryL2R, next: NextAction = nextAction(l.facts)): Primary {
  const base = { action: next, why: null as string | null, disabled: false, run: () => {} }
  switch (next) {
    case 'needs-take':
      return { ...base, verb: 'Render', price: null, disabled: true, why: l.facts.take ? KIT_NEEDS_FRAMES : KIT_NEEDS_TAKE }
    case 'needs-still':
      return { ...base, verb: 'Render', price: l.price, disabled: true, why: L2R_NEEDS_STILL }
    case 'l2r': {
      const why = !l.facts.prompt ? L2R_UNKNOWN_TAG : !l.configured ? NO_COMFY_TARGET : l.facts.running ? 'A render is running.' : null
      return { ...base, verb: l.facts.rendered ? 'Render again' : 'Render', price: l.price, disabled: !!why || l.price === null, why, run: () => void l.render() }
    }
    case 'l2r-finish': {
      const cur = l.current
      const why = l.finishingNow ? 'Finishing.' : null
      return { ...base, verb: 'Finish', price: 0, disabled: !cur || !!why || l.state.working, why, run: () => { if (cur) void l.finish(cur.id) } }
    }
    case 'export':
      return { ...base, verb: 'Export', price: null, run: () => { window.location.hash = studioHash('export', currentSceneId()) } }
  }
}

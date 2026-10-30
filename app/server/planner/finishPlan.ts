/**
 * What happens to a plan that passed the gate, before it is saved (Track C, free): every prop the sentence's Props list names is
 * in it (propStandIns.ts), and a plan with few pieces in the master view says so in its notes (a warning, never a refusal; an
 * interior is exempt, a room is not an orchard).
 */
import type { ScenePlan } from '../../src/stage3d/contract.ts'
import { propsOf } from '../../src/stage3d/planProps.ts'
import { MIN_VISIBLE_PIECES, visibleInMaster } from '../../src/stage3d/planVisible.ts'
import { ensureProps } from './propStandIns.ts'

export function finishPlan(plan: ScenePlan, prompt: string): { plan: ScenePlan; notes: string[] } {
  const { plan: out, added } = ensureProps(plan, propsOf(prompt))
  const notes = added.length ? [`stand-in pieces added for the props the plan left out: ${added.join(', ')}`] : []
  const seen = visibleInMaster(out).length
  if (seen < MIN_VISIBLE_PIECES && out.sky.look !== 'interior')
    notes.push(`thin set: only ${seen} piece${seen === 1 ? '' : 's'} in the master view (fewer than ${MIN_VISIBLE_PIECES}); a place named as many things should be repeated to fill the ground`)
  return { plan: out, notes }
}

import { gradeFor, holdFor, NO_PICKS } from './finishChoice'
import type { L2RRender, TakeRecord } from '../../shared/shotContract'
import type { L2RState } from './l2rStore'

/** the seed a fresh Render panel starts on (l2rStore's INITIAL) */
export const DEFAULT_SEED = 42

/**
 * How many Advanced controls are off their default. The collapsed Advanced header says so, so nothing hidden there changes a
 * paid render unseen: a seed other than the default, a prompt override, a keyframe ticked on (they start off), a hold other than
 * the take's own default, and the free finish's grade once the owner touched them.
 */
export function advancedChanged(s: L2RState, cur: L2RRender | null): number {
  const take: TakeRecord | null | undefined = s.status?.take
  const keys = (['mid', 'end'] as const).filter((n) => !!s.status?.keyframes?.[n] && !s.keyOff[n]).length // each ticked one counts
  return [
    s.seed !== DEFAULT_SEED,
    !!s.prompt.trim(),
    s.picks.hold !== null && s.picks.hold !== holdFor(NO_PICKS, take),
    s.picks.gradeTouched && gradeFor(s.picks, cur) !== null,
  ].filter(Boolean).length + keys
}

/** the drawer's header: plain "Advanced", or "Advanced · 2 changed" */
export const advancedLabel = (n: number): string => (n > 0 ? `Advanced · ${n} changed` : 'Advanced')

// The stride fit's switch (2026-10-29, src/stage3d/motion/strideFit.ts). A take locked before the fit keeps no frames of its own:
// the figure is compiled again from the world's saved performance, so turning the fit on for every plan would move the stride of
// every take already locked. The server therefore turns it on only for a walk saved new or changed from now on; a save that leaves
// the walk as it was (the shot's length, the cast) keeps whatever the saved file said. Later walk fixes (the soft settle) ride the
// same switch, each under its own mark, so a walk saved between two fixes keeps the first and not the second. Pure.
import type { PerformancePlan } from '../../src/stage3d/contract.ts'

/** the parts of a performance a locked take's walk is made of */
const walkOf = (p: PerformancePlan) => JSON.stringify([p.path, p.pace ?? null, p.gait ?? null, p.actions ?? null, p.turnRadius ?? null])

/** the walk's marks, each switched the same way from the day it landed (one per line, so each can be taken out alone) */
export const WALK_MARKS = [
  'strideFit', // motion/strideFit.ts
  'softSettle', // motion/settle.ts
] as const satisfies readonly (keyof PerformancePlan)[]

/** every mark a walk saved new or changed takes now (for tests: `{ ...perf, ...NEW_WALK }`) */
export const NEW_WALK = Object.fromEntries(WALK_MARKS.map((k) => [k, true])) as { [K in (typeof WALK_MARKS)[number]]: true }

/** `next` with the walk's marks set: each true when there is no saved walk or the walk changed, else the saved file's own value
 *  (never on a stand); whatever the page sends for them is ignored */
export function stampStrideFit<P extends PerformancePlan>(next: P, saved: PerformancePlan | null): P {
  const rest: PerformancePlan = { ...next }
  for (const k of WALK_MARKS) delete rest[k]
  if (next.stand) return rest as P // a stand has no walk to fit
  const changed = !saved || walkOf(saved) !== walkOf(next)
  for (const k of WALK_MARKS) if (changed || saved?.[k] === true) rest[k] = true
  return rest as P
}

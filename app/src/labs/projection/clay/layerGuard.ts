// The performer a clay is captured with (PLAN-PER-TAKE-PERFORMANCE.md §3): held from the first frame, checked before every frame and
// once more before the finish, and named on the finish (`packId`, the server's stamp). A take switched, a walk loaded or a figure
// rebuilt mid-capture would mix two walks into one take's frames: the export stops instead, and nothing is finished.
import type { Stage } from '../engine/Stage'

export const PERFORMER_CHANGED = 'The walk on the set changed while the frames were being prepared, so nothing was saved. Prepare them again (free).'

type Layer = { pack?: { id?: string } } | null

export interface HeldPerformer {
  /** the captured performer's pack id (null = none on the set); undefined only for a stage with no world (a test stub) */
  packId: string | null | undefined
  /** throws PERFORMER_CHANGED when the stage's performer is not the one held */
  check(): void
}

/** `want`: the take's packId; a stage already playing another performer throws at once */
export function holdPerformer(stage: Stage, want?: string | null): HeldPerformer {
  const world = (stage as { world?: { performance?: Layer } }).world
  const at = world?.performance ?? null
  if (world && want !== undefined && (at?.pack?.id ?? null) !== want) throw new Error(PERFORMER_CHANGED)
  return {
    packId: world ? at?.pack?.id ?? null : undefined,
    check() { if (world && (world.performance ?? null) !== at) throw new Error(PERFORMER_CHANGED) },
  }
}

// The set a clay is captured on (PLAN-PER-TAKE-SET.md, Risk 1), held the same way: its key from the first frame, checked before
// every frame and once more before the finish, and named on the finish (`setKey`, the server's stamp). A take switched, a set
// loaded or edited, or the world rebuilt mid-capture would mix two sets into one take's frames: the export stops instead.
export const SET_CHANGED = 'The set on the stage changed while the frames were being prepared, so nothing was saved. Prepare them again (free).'

type KitSet = { plan?: unknown } | null

export interface HeldSet {
  /** the captured set's key (null = no kit set on the stage) */
  setKey: string | null
  /** throws SET_CHANGED when the stage's set is not the one held */
  check(): void
}

/** `want`: the take's own set key when it holds its own set (the stage must show it); undefined = whatever set stands (a take
 *  with no copy is prepared again on the scene's set, and the finish names that set) */
export function holdSet(stage: Stage, keyOf: (plan: unknown) => string | null, want?: string | null): HeldSet {
  const kit = () => (stage as { kit?: KitSet }).kit ?? null
  const at = kit()
  const key = keyOf(at?.plan ?? null)
  if (want !== undefined && key !== want) throw new Error(SET_CHANGED)
  return {
    setKey: key,
    check() { const k = kit(); if (k !== at || keyOf(k?.plan ?? null) !== key) throw new Error(SET_CHANGED) },
  }
}

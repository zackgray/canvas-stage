// Blocking's edit state <-> the stored KitPerformance (pure). Actions are held against the path point they were placed on, so a
// path edit moves them with their point (or drops them with it) and their metres-along-the-path are recomputed at save: the old
// bug was a saved `at` left pointing at a spot on a path that no longer exists.
import type { ActionKind, CreaturePlan, ExtraPlan, MarkPlan } from '../../../../stage3d/contract'
import type { GenClipId } from '../../../../stage3d/clips'
import { standPath } from '../../../../stage3d/motion/standPlan'
import type { KitPerformance } from '../../../../../server/stage3d/types'
import { arcs, pathLength, pointAtArc, type Pt } from './blockingMath'

/** an action in the editor: on path point `point`, or (point -1) a saved one at `at` metres that sits on no point */
export interface EditAction {
  kind: ActionKind
  point: number
  at: number
  seconds?: number
  deg?: number
  /** (track D2) a made move: its kept clip's id and the ground point of the piece it names; `words` is the user's own, shown
   *  in the list — editor-only, never written (planOf drops it; the clip's own record keeps the words) */
  motion?: GenClipId
  toward?: [number, number]
  words?: string
}

export interface BlockingDraft {
  path: Pt[]
  actions: EditAction[]
  extras: ExtraPlan[]
  /** the creatures: part of the draft so the live save, not a side write, carries them */
  creatures: CreaturePlan[]
  pace: number
  gait: 'walk' | 'run'
  /** '' = as saved */
  castId: string
}

export const DEFAULT_PACE = 0.8

/** what the clip library can play on a point, with the editor's defaults */
export const ACTION_DEFAULTS: Record<Exclude<ActionKind, 'idle'>, { label: string; seconds?: number; deg?: number; hint?: string }> = {
  stop: { label: 'Stop', seconds: 1.5 },
  look: { label: 'Look', seconds: 2, deg: 45 },
  turn: { label: 'Turn', deg: 90 },
  kneel: { label: 'Kneel', seconds: 2 },
  lift: { label: 'Lift a frame', seconds: 2, hint: 'A ready-made move: lift a flat frame with both hands and hold it up; a box for it comes with the move when no set piece is beside the figure' },
  // (track D) a made move, kept as a user clip; Track E's panel opens from this and places it with its motion id and piece
  move: { label: 'Describe a move…', seconds: 2, hint: 'Describe what happens here in plain words; the motion computer makes the move' },
}

/** the draft of a stored performance; a stand reads back as its one point (the mark), its stub dropped */
export function draftFrom(perf: KitPerformance): BlockingDraft {
  const path = (perf.stand ? perf.path.slice(0, 1) : perf.path).map((p) => [p[0], p[1]] as Pt)
  return {
    path,
    actions: (perf.actions ?? []).map((a) => ({ ...a, point: pointAtArc(path, a.at) })),
    extras: (perf.extras ?? []).map((e) => ({ ...e, path: e.path.map((p) => [p[0], p[1]] as Pt) })),
    creatures: (perf.creatures ?? []).map((c) => ({ ...c, at: [c.at[0], c.at[1]] as [number, number] })),
    pace: perf.pace ?? DEFAULT_PACE, gait: perf.gait ?? 'walk', castId: '',
  }
}

/** the actions after the path changed: point actions follow their point (dropped with it), free ones past the end are dropped */
export function reanchor(actions: EditAction[], path: Pt[]): EditAction[] {
  const a = arcs(path), len = pathLength(path)
  return actions.flatMap((x) => {
    if (x.point >= 0) return x.point < path.length ? [{ ...x, at: round(a[x.point]) }] : []
    return x.at <= len + 1e-6 ? [x] : []
  })
}

const round = (v: number) => Math.round(v * 1000) / 1000

/**
 * The performance Save writes: the latest stored one (`saved`: whatever was read last, so a shot length saved elsewhere rides
 * through) with this draft's motion, extras and cast laid over it. A one-point draft is a stand: `stand: true` and the mark plus
 * its stub along the mark's facing (`mark`, the subject's mark; unset, the draft's point facing +z). A walk writes no `stand`.
 */
export function planOf(saved: KitPerformance, d: BlockingDraft, mark?: MarkPlan): KitPerformance {
  const { actions: _a, extras: _e, creatures: _k, gait: _g, castId: _c, stand: _s, ...rest } = saved
  const actions = reanchor(d.actions, d.path).map(({ kind, at, seconds, deg, motion, toward }) =>
    ({ kind, at, ...(seconds !== undefined ? { seconds } : {}), ...(deg !== undefined ? { deg } : {}),
      ...(motion !== undefined ? { motion } : {}), ...(toward !== undefined ? { toward } : {}) }))
  const castId = d.castId || saved.castId
  const stands = d.path.length === 1
  return {
    ...rest, ...(stands ? { stand: true, path: standPath(mark ?? { at: d.path[0] }) } : { path: d.path }), pace: d.pace,
    ...(saved.gait !== undefined || d.gait !== 'walk' ? { gait: d.gait } : {}),
    ...(saved.actions !== undefined || actions.length ? { actions } : {}),
    ...(saved.extras !== undefined || d.extras.length ? { extras: d.extras } : {}),
    ...(saved.creatures !== undefined || d.creatures.length ? { creatures: d.creatures } : {}),
    ...(castId ? { castId } : {}),
  }
}

/** true when Save would write something other than what is stored */
export function changedFrom(saved: KitPerformance, d: BlockingDraft, mark?: MarkPlan): boolean {
  return canon(planOf(saved, d, mark)) !== canon({ ...saved, pace: saved.pace ?? DEFAULT_PACE })
}

/** the same performance, key order aside (a re-read of the one this page saved is not a change from outside) */
export const samePerf = (a: KitPerformance, b: KitPerformance): boolean => canon(a) === canon(b)

/** key-order-free identity of a performance (the live-save's refusal guard and in-flight adoption check) */
export const perfKey = (p: KitPerformance): string => canon(p)

/** key-order-free JSON, so a re-read performance compares equal to the one it was saved from */
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) => (x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : x))
}

// Blocking's edit operations (split out of useBlocking, wave A S3): the hero (stand or walk, path, pace, gait, who plays him), the
// actions on his points and the extras. Each takes the hook's current state and setters; the hook owns the state, Save and the
// derived lines. Point 1 of the hero's path is the subject's mark: it is never removed (Undo stops there) and never moved (a lift
// on it says how far the mark is from the hive instead). One point is a stand.
import { CREATURE_KIND, EXTRA_COSTUME, type ActionKind, type CreaturePlan, type ExtraPlan, type KitItem, type PathAction } from '../../../../stage3d/contract'
import type { GenClipId } from '../../../../stage3d/clips'
import type { BibleRecord } from '../../../../shared/bibleContract'
import type { KitWorld } from '../../../../labs/projection/stage3d/kitApi'
import { setMovePreview } from '../../../../labs/projection/stage3d/movePreview'
import type { PickedMove } from '../../moves'
import { markOf } from '../../../../stage3d/mark'
import { hiveNear, standBy } from '../../../../stage3d/props/liftSpots'
import { arcs, type Pt } from './blockingMath'
import { ACTION_DEFAULTS, reanchor, type BlockingDraft, type EditAction } from './blockingPlan'
import { crossingExtra, type CrossingId } from './crossings'
import { standingExtra } from './extraStaging'
import type { Target } from './useBlocking'

export interface OpsCtx {
  world: KitWorld
  draft: BlockingDraft
  point: number | null
  variants: number
  bible: BibleRecord | null
  edit: (f: (d: BlockingDraft) => BlockingDraft) => void
  setPath: (f: (p: Pt[]) => Pt[]) => void
  setExtra: (n: number, f: (e: ExtraPlan) => ExtraPlan) => void
  setPoint: (p: number | null) => void
  setTarget: (t: Target) => void
  setNote: (s: string | null) => void
}

/** metres: a mark farther than this from where she would stand at a set hive cannot reach it */
const REACH_SLACK = 0.3

export function heroOps(c: OpsCtx) {
  const mark = () => markOf(c.world.plan).at
  return {
    /** a fresh path: every action placed on the old one is cleared (their points are gone); it starts on the subject's mark, clicks add the rest */
    newPath: () => { c.edit((d) => ({ ...d, path: [mark()], actions: [] })); c.setPoint(null); c.setTarget({ kind: 'hero' }) },
    /** stand at the mark: the path is its first point (the mark); actions on the dropped points go with them */
    stand: () => { c.setPath((p) => (p.length ? p.slice(0, 1) : [mark()])); c.setPoint(0); c.setTarget({ kind: 'select' }) },
    /** walk: clicks on the ground add points after the mark */
    walk: () => { c.setPath((p) => (p.length ? p : [mark()])); c.setTarget({ kind: 'hero' }) },
    /** the Add-here panel (merge 6d): the walk starts where the mark is moved to — the path's first point becomes that spot,
     *  the rest of the walk rides; a lone start stands (the flag) until a second click gives the walk somewhere to go */
    startAt: (p: Pt) => { c.edit((d) => ({ ...d, path: [p, ...d.path.slice(1)] })); c.setPoint(null); c.setTarget({ kind: 'hero' }) },
    /** the Add-here panel (merge 6d): stand where the mark is moved to — the path is that point alone (the stand flag) */
    standAt: (p: Pt) => { c.setPath(() => [p]); c.setPoint(0); c.setTarget({ kind: 'select' }) },
    /** Clear her action (the Stage's person panel): back to standing on the mark, no action, no path, no extras */
    clear: () => { c.edit((d) => ({ ...d, path: [mark()], actions: [], extras: [] })); c.setPoint(0); c.setTarget({ kind: 'select' }) },
    /** the Stage's Walk to a spot: the walk is the mark and that spot (actions on the mark stay; any further points are dropped) */
    walkTo: (p: Pt) => { c.setPath(() => [mark(), p]); c.setPoint(null); c.setTarget({ kind: 'select' }) },
    /** pace and gait together (the Stage's Slow walk / Walk / Run) */
    setSpeed: (pace: number, gait: 'walk' | 'run') => c.edit((d) => ({ ...d, pace, gait })),
    /** the last point goes; point 1 (the mark) stays, so Undo to one point is a stand */
    undo: () => c.setPath((p) => (p.length > 1 ? p.slice(0, -1) : p)),
    /** drag a point on the map to it; point 1 (the mark) is never moved — move the mark on the Set */
    movePoint: (i: number, p: Pt) => { if (i > 0) c.setPath((q) => q.map((old, j) => (j === i ? p : old))) },
    setPace: (v: number) => c.edit((d) => ({ ...d, pace: v })),
    setGait: (g: 'walk' | 'run') => c.edit((d) => ({ ...d, gait: g })),
    setCast: (id: string) => c.edit((d) => ({ ...d, castId: id })),
  }
}

/** the creatures (the Stage's Add a creature): up to MAX_CREATURES, each one a creatures entry in the draft */
export const MAX_CREATURES = 4
/** metres behind the mark (away from the camera, which looks toward -z) a new creature stands */
const CREATURE_BEHIND_M = 20

export function creatureOps(c: OpsCtx) {
  return {
    add: () => c.edit((d) => {
      if (d.creatures.length >= MAX_CREATURES) return d
      const [x, z] = markOf(c.world.plan).at
      return { ...d, creatures: [...d.creatures, { kind: CREATURE_KIND, action: 'roar', at: [x, z - CREATURE_BEHIND_M], yawDeg: 0, scale: 1.2 } as CreaturePlan] }
    }),
    moveTo: (n: number, p: Pt) => c.edit((d) => ({ ...d, creatures: d.creatures.map((k, i) => (i === n ? { ...k, at: p } : k)) })),
    remove: (n: number) => c.edit((d) => ({ ...d, creatures: d.creatures.filter((_, i) => i !== n) })),
  }
}

export function actionOps(c: OpsCtx) {
  return {
    add: (kind: Exclude<ActionKind, 'idle'>) => {
      const point = c.draft.path.length === 1 ? 0 : c.point
      if (point === null) return
      const { seconds, deg } = ACTION_DEFAULTS[kind]
      // a lift beside a hive of the set lifts from it: a later point moves to stand at it, facing it, and no second hive is brought;
      // point 1 is the mark and never moves (the reach line says how far the mark is from the hive)
      const h = kind === 'lift' && point > 0 ? hiveNear(c.world.plan.kit, c.draft.path[point]) : -1
      const path = h >= 0 ? c.draft.path.map((p, i) => (i === point ? standBy(c.world.plan.kit[h], c.draft.path[point - 1] ?? p) : p)) : c.draft.path
      const a: EditAction = { kind, point, at: 0, ...(seconds !== undefined ? { seconds } : {}), ...(deg !== undefined ? { deg } : {}) }
      c.edit((d) => ({ ...d, path, actions: reanchor([...d.actions, a], path) }))
      if (h >= 0) c.setNote(`The hero lifts from the set's ${c.world.plan.kit[h].label?.trim() || 'hive'}: that point moved to stand at it.`)
    },
    set: (i: number, patch: { seconds?: number; deg?: number }) => c.edit((d) => ({ ...d, actions: d.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) })),
    remove: (i: number) => c.edit((d) => ({ ...d, actions: d.actions.filter((_, j) => j !== i) })),
    /** (track D2) Use this one: a made move placed on the point — the kept clip's hold as its seconds, its id as `motion`,
     *  the named piece's ground point as `toward`; live-saves like any edit. The panel has just closed. */
    addMove: (point: number, picked: PickedMove) => {
      const f = pickedMoveFields(picked, c.world.plan.kit)
      const a: EditAction = { kind: 'move', point, at: 0, ...f, words: picked.words }
      setMovePreview(null) // the move is on the saved performance now: drop the audition
      c.edit((d) => ({ ...d, actions: reanchor([...d.actions, a], d.path) }))
    },
    /** (track D2) Play here: the saved performance plus this one unsaved move action, offered to the clay (movePreview.ts);
     *  the existing performer path plays it, nothing is written */
    previewMove: (point: number, picked: PickedMove) => {
      const f = pickedMoveFields(picked, c.world.plan.kit)
      const at = Math.round((arcs(c.draft.path)[point] ?? 0) * 1000) / 1000
      const action: PathAction = { kind: 'move', at, ...f }
      setMovePreview({ worldId: c.world.id, perf: { ...c.world.perf, actions: [...(c.world.perf.actions ?? []), action] } })
    },
  }
}

/** (track D2) the fields a picked move gives the action: `motion` = the kept clip's id; `toward` = the named piece's ground
 *  point (the spec's prop.pieceId is the kit index the panel measured); `seconds` = the clip's hold window, its natural hold */
export function pickedMoveFields(picked: PickedMove, kit: readonly KitItem[]): { seconds: number; motion: GenClipId; toward?: [number, number] } {
  const hold = (picked.clip as { hold?: [number, number] }).hold
  const seconds = hold && hold[1] > hold[0] ? Math.round((hold[1] - hold[0]) * 100) / 100 : 2
  const idx = picked.spec?.prop?.pieceId
  const toward = idx !== undefined && kit[Number(idx)] ? (kit[Number(idx)].at as [number, number]) : undefined
  return { seconds, motion: picked.clipId as GenClipId, ...(toward ? { toward } : {}) }
}

/** a lift on point 1 (the mark) beside a set hive she cannot reach from the mark: the line saying so, else null */
export function reachLine(kit: readonly KitItem[], path: Pt[], actions: EditAction[]): string | null {
  const m = path[0]
  if (!m || !actions.some((a) => a.kind === 'lift' && a.point === 0)) return null
  const h = hiveNear(kit, m)
  if (h < 0) return null
  const s = standBy(kit[h] as KitItem, m), d = Math.hypot(s[0] - m[0], s[1] - m[1])
  return d > REACH_SLACK ? `The mark is ${d.toFixed(1)} m from the hive: move the mark beside it on the Set so the hero can reach it.` : null
}

export function extraOps(c: OpsCtx) {
  return {
    addPreset: (id: CrossingId) => {
      if (c.draft.path.length < 2) return
      c.edit((d) => ({ ...d, extras: [...d.extras, crossingExtra(id, d.path, d.extras.length, c.variants)] }))
    },
    /** a drawn extra: an empty path, then clicks on the top view draw it */
    addDrawn: () => {
      const n = c.draft.extras.length
      c.edit((d) => ({ ...d, extras: [...d.extras, { path: [], gait: 'walk', delay: 0, costume: EXTRA_COSTUME, variant: n % c.variants }] }))
      c.setTarget({ kind: 'extra', n })
    },
    set: (n: number, patch: Partial<ExtraPlan>) => c.setExtra(n, (e) => ({ ...e, ...patch })),
    /** a tag picked (or cleared): only the tag changes; the extra's saved costume stays as it is */
    setTag: (n: number, tag: string) => c.setExtra(n, ({ tag: _t, ...e }) => ({ ...e, ...(tag ? { tag } : {}) })),
    /** Stand: keep only the first point (a stander is one spot, on the idle clip); Walk: back to a path to redraw, the face point dropped */
    setStand: (n: number, stand: boolean) => {
      c.setExtra(n, ({ face, stand: _s, ...e }) => (stand ? { ...e, stand: true, path: e.path.slice(0, 1), ...(face ? { face } : {}) } : e))
      if (!stand) c.setTarget({ kind: 'extra', n })
    },
    setLook: (n: number, i: number, patch: { seconds?: number; deg?: number }) =>
      c.setExtra(n, (e) => ({ ...e, actions: (e.actions ?? []).map((a, j) => (j === i ? { ...a, ...patch } : a)) })),
    removeAction: (n: number, i: number) => c.setExtra(n, ({ actions, ...e }) => {
      const rest = (actions ?? []).filter((_, j) => j !== i)
      return rest.length ? { ...e, actions: rest } : e
    }),
    /** one click: a named person standing beside the hero's start, facing him */
    stage: (tag: string) => c.edit((d) => (d.path.length ? { ...d, extras: [...d.extras, standingExtra(tag, d.path, d.extras.length, c.variants)] } : d)),
    remove: (n: number) => { c.edit((d) => ({ ...d, extras: d.extras.filter((_, i) => i !== n) })); c.setTarget({ kind: 'select' }) },
  }
}

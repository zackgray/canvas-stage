/**
 * Performer3D from a PerformancePlan: the plan compiles into a motion timeline (motion/compile.ts: start, gait, stop, idle, look, turn,
 * kneel, lift, crossfaded) played on the neutral clay mannequin (a saved costume is not read); a lift brings its hive and frame (props/liftProps.ts). poseAt is pure in t. The figure's meshes are children of `object`; `object` itself
 * is never moved, so the stage may position and scale it.
 *
 * (E1) Extras walk their own paths on the same clock (each from its `delay`), and creatures act at their ground points; both hang
 * under `object`. Every figure carries `userData.entity` (contract EntityTag): `object` is 'hero', an extra's group
 * 'extra:<n>:<variant>', a creature's 'creature:<kind>'. The nearest tagged ancestor names a mesh (an extra's limbs are inside the
 * hero's object but belong to the extra).
 */
import * as THREE from 'three'
import type { EntityTag, ExtraPlan, KitItem, PerformancePlan, Performer3D } from './contract.ts'
import { createDragon } from './creatures/dragon.ts'
import { extraSpec } from './figureSpec.ts'
import { buildFigure } from './mannequin.ts'
import { compile, type Timeline } from './motion/compile.ts'
import { extraMotionPlan } from './motion/extraPlan.ts'
import { heroTimeline } from './motion/heroPlan.ts'
import { fetchLibraryWith, type Library } from './motion/library.ts'
import { evaluator } from './motion/timeline.ts'
import { liftRig } from './props/liftProps.ts'

/** cumulative arc lengths of a ground polyline */
export function arcLengths(path: [number, number][]): number[] {
  const out = [0]
  for (let i = 1; i < path.length; i++) out.push(out[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]))
  return out
}

/** point and unit heading at arc length s along the polyline (clamped) */
export function along(path: [number, number][], arcs: number[], s: number): { p: THREE.Vector3; h: THREE.Vector3 } {
  const total = arcs[arcs.length - 1], c = Math.min(Math.max(s, 0), total)
  let i = 1
  while (i < arcs.length - 1 && arcs[i] < c) i++
  const a = path[i - 1], b = path[i], seg = arcs[i] - arcs[i - 1] || 1, k = (c - arcs[i - 1]) / seg
  const h = new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]).normalize()
  return { p: new THREE.Vector3(a[0] + (b[0] - a[0]) * k, 0, a[1] + (b[1] - a[1]) * k), h }
}

/** one figure's ground point over the performance (performance seconds), for free planning such as the close-pass keyframe hint */
export interface GroundTrack { id: EntityTag; height: number; at(t: number): [number, number] }

export type MotionPerformer = Performer3D & { readonly timeline: Timeline; /** the hero's and each extra's ground track */ readonly tracks: GroundTrack[] }

/** an extra's entity tag (contract EntityTag) */
export const extraEntity = (n: number, variant: number): EntityTag => `extra:${n}:${variant}`

/** the nearest `userData.entity` up the tree from `o`, or null (the world); what the ID pass colours a mesh by */
export function entityOf(o: { userData: Record<string, unknown>; parent: unknown } | null): EntityTag | null {
  for (let n = o; n; n = n.parent as typeof o) if (typeof n.userData?.entity === 'string') return n.userData.entity as EntityTag
  return null
}

/**
 * one extra: its own timeline played on its own figure, `delay` seconds late; it stands at its start until then.
 * A figure of height scale s has legs s times as long, so the clip's feet cover s times the ground per stride. The timeline is therefore
 * compiled on the path scaled by 1/s (the clip's own metres) and the pose root scaled back by s: strides shrink or grow with the figure
 * and the feet stay planted whatever the build. The figure stands on the ground through its own position, not the clip's root height.
 */
function extraFrom(e: ExtraPlan, n: number, groundAt: (x: number, z: number) => number, lib: Library, heroStart: [number, number]) {
  const spec = extraSpec(e.variant), s = spec.build.height
  const delay = e.stand ? 0 : e.delay // a stander is there from the first frame
  const ev = evaluator(compile(extraMotionPlan(e, s, heroStart), lib)), figure = buildFigure(lib.canon, 1.8, spec)
  figure.fig.userData.entity = extraEntity(n, e.variant)
  const pose = (t: number) => { const p = ev.pose(Math.max(0, t - delay)); p.root.x *= s; p.root.z *= s; figure.fig.position.y = groundAt(p.root.x, p.root.z); figure.apply(p) }
  const track: GroundTrack = { id: extraEntity(n, e.variant), height: 1.8 * s, at: (t) => { const a = ev.anchor(Math.max(0, t - delay)); return [a.x * s, a.z * s] } }
  return { object: figure.fig, pose, track }
}

/** a performer from an already-loaded library (tests, the motion viewer); `setKit` = the set's pieces (a hive there serves a lift) */
export function performerFrom(plan: PerformancePlan, groundAt: (x: number, z: number) => number, lib: Library, setKit: readonly KitItem[] = []): MotionPerformer {
  const timeline = heroTimeline(plan, lib), ev = evaluator(timeline), figure = buildFigure(lib.canon, 1.8)
  figure.fig.userData.entity = 'hero' satisfies EntityTag
  const creatures = (plan.creatures ?? []).map((c) => createDragon({ at: c.at, yawDeg: c.yawDeg, scale: c.scale, groundAt }))
  for (const [i, c] of creatures.entries()) { c.object.userData.entity = `creature:${plan.creatures![i].kind}` satisfies EntityTag; figure.fig.add(c.object) }
  const extras = (plan.extras ?? []).map((e, n) => extraFrom(e, n, groundAt, lib, plan.path[0]))
  for (const x of extras) figure.fig.add(x.object)
  const props = liftRig(timeline, lib.canon, groundAt, setKit) // a lift's hive and frame (none for most takes; the set's hive when it has one there)
  if (props) figure.fig.add(props.object)
  function poseAt(t: number): void {
    for (const c of creatures) c.pose(t)
    for (const x of extras) x.pose(t)
    const p = ev.pose(t)
    p.root.y += groundAt(p.root.x, p.root.z)
    figure.apply(p)
    props?.pose(t, p)
  }
  const anchorAt = (t: number) => { const a = ev.anchor(t); return new THREE.Vector3(a.x, groundAt(a.x, a.z), a.z) }
  const headingAt = (t: number) => { const y = ev.heading(t); return new THREE.Vector3(Math.sin(y), 0, Math.cos(y)) }
  const tracks: GroundTrack[] = [{ id: 'hero', height: 1.8, at: (t) => { const a = ev.anchor(t); return [a.x, a.z] } }, ...extras.map((x) => x.track)]
  poseAt(0)
  return { object: figure.fig, duration: timeline.duration, poseAt, anchorAt, headingAt, timeline, tracks }
}

export async function createPerformer(plan: PerformancePlan, groundAt: (x: number, z: number) => number, setKit: readonly KitItem[] = []): Promise<MotionPerformer> {
  // a move made after the page loaded the library (Play here right after Make it) is read in first
  const made = [...(plan.actions ?? []), ...(plan.extras ?? []).flatMap((e) => e.actions ?? [])].flatMap((a) => (a.kind === 'move' && a.motion ? [a.motion] : []))
  return performerFrom(plan, groundAt, await fetchLibraryWith(made), setKit)
}

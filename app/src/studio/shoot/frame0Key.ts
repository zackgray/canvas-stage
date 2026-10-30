// The frame-0 key (carryContract.ts): a hash of what a take's frame 0 SHOWS, computed in the page at lock, so the server can carry the
// approved opening still across a re-lock that left frame 0 alone (a fix to an extra's mid-path point, a pace change after the start).
// startKey cannot say that: it hashes the camera, focal and performance frame only, not where the people stand at that frame.
// In: the clay camera at frame 0 (the warp plan's, as the stills are drawn on), the focal and aspect, every figure posed at frame 0's
// performance time (hero, extras and creatures all hang under the performer's object) and the kit set plan (a moved generated piece
// changes the frame), plus what the figures wear and who plays the hero (a costume or cast change keeps every pose).
// Coarse on purpose: 1 cm, ~1 degree; a float wobble must not read as a moved person, a moved person must.
import type { Object3D } from 'three'
import type { PackTiming } from '../../labs/projection/performance/frames'
import { clayPlan } from '../../labs/projection/clay/plan'
import type { TakeLockRequest } from '../../shared/shotContract'
import type { PerformancePlan } from '../../stage3d/contract'

/** what the key reads of the figures: the performer's object tree and its pose clock (MocapLayer.performer) */
export interface Frame0Figures { readonly object: Object3D; poseAt(t: number): void }

const fnv = (text: string): string => {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}
const q = (n: number, step: number) => String(Math.round(n / step))

/** every node's pose in its parent, in tree order: positions to 1 cm, rotations to ~1 degree (quaternion units of 0.01) */
export function poseText(root: Object3D): string {
  const out: string[] = []
  root.traverse((o) => {
    const p = o.position, r = o.quaternion, s = o.scale
    // a quaternion and its negation are the same rotation: fix the sign so a flip does not read as a turn
    const k = r.w < 0 ? -1 : 1
    const at = [p.x, p.y, p.z].map((v) => q(v, 0.01)), turn = [r.x, r.y, r.z, r.w].map((v) => q(v * k, 0.01)), size = [s.x, s.y, s.z].map((v) => q(v, 0.01))
    out.push(`${at}:${turn}:${size}${o.visible ? '' : ':h'}`)
  })
  return out.join(';')
}

/** what the figures look like, not how they move: costumes, the cast card (performance.json castId) and creature kinds */
export function appearanceOf(perf: (PerformancePlan & { castId?: string }) | null): unknown {
  if (!perf) return null
  return { costume: perf.costume ?? null, castId: perf.castId ?? null, extras: (perf.extras ?? []).map((e) => [e.variant, e.costume, e.tag ?? null]),
    creatures: (perf.creatures ?? []).map((c) => [c.kind, c.scale ?? null]) }
}

/**
 * The key a lock of `request` gets, or null when this set cannot say what frame 0 shows (no kit plan: a panorama world, a pack's
 * lifted performance). `figures` null on a kit world = nobody on the set. Posing at frame 0 is left in place: the stage's loop
 * poses the world for its own clock before the next draw.
 */
export function frame0Key(request: Pick<TakeLockRequest, 'samples' | 'timelineStart' | 'viewAspect' | 'focal' | 'frames' | 'perfStart'>,
  pack: PackTiming | null, figures: Frame0Figures | null, set: { plan: unknown; look: unknown } | null): string | null {
  if (!set || set.plan === null || set.plan === undefined || request.timelineStart === undefined) return null
  let f0
  try { f0 = clayPlan({ smoothed: request.samples, timelineStart: request.timelineStart, viewAspect: request.viewAspect }, pack, request.frames).frames[0] } catch { return null }
  const cam = [...f0.position, ...f0.quaternion].map((v) => q(v, 1e-4)).join(',') + `|${q(request.focal, 0.01)}|${q(request.viewAspect, 1e-4)}|${request.perfStart}`
  let people = 'none'
  if (figures) {
    figures.poseAt(f0.t)
    figures.object.updateMatrixWorld(true)
    people = poseText(figures.object)
  }
  return fnv(`${cam}#${fnv(people)}#${fnv(JSON.stringify(set.plan))}#${fnv(JSON.stringify(set.look ?? null))}`)
}

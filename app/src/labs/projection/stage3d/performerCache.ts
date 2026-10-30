// Built performers parked by walk, so switching back to a take puts the figure up again instead of rebuilding it. A parked performer
// is owned by nobody (exclusive: take() removes it), so two stages never share one figure, and every show gets a NEW MocapLayer
// around it: the capture guard compares layer identity, and a switch away and back mid-capture must still abort it.
import type { PerformancePlan, Performer3D, ScenePlan } from '../../../stage3d/contract'
import { disposeTree } from '../../../stage3d/dispose'
import { planHash } from '../../../stage3d/planHash'

export const PERFORMER_CACHE_MAX = 4

const parked = new Map<string, Performer3D>() // least recently parked first

/** what of the set the figure is built from (performer.ts): the ground it stands on (groundAt = heightFn: ground, seed, flat) and
 *  the pieces (a lift's hive is the set's) */
export type PerformerSet = Pick<ScenePlan, 'ground' | 'seed' | 'flat' | 'kit'>

/** pack id (the walk) plus everything else the figure is built from: the whole plan (cast, settle, stride) and, from the set, its
 *  ground (review F2: a figure built on one ground is never put up on another) and its pieces */
export function performerKey(perf: PerformancePlan, worldId: string, set: Partial<PerformerSet> | null = null): string {
  const s = { ground: set?.ground ?? null, seed: set?.seed ?? null, flat: set?.flat ?? null, kit: set?.kit ?? [] }
  return `mocap-${planHash(perf)}|${worldId}|${hashText(JSON.stringify([perf, s]))}`
}

function hashText(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(36)
}

export function takeParked(key: string): Performer3D | null {
  const p = parked.get(key) ?? null
  parked.delete(key)
  return p
}

export function parkPerformer(key: string, p: Performer3D): void {
  const old = parked.get(key)
  parked.delete(key)
  if (old && old !== p) disposeTree(old.object)
  p.object.removeFromParent()
  parked.set(key, p)
  while (parked.size > PERFORMER_CACHE_MAX) {
    const k = parked.keys().next().value as string
    disposeTree(parked.get(k)!.object); parked.delete(k)
  }
}

export function clearParkedPerformers(): void {
  for (const p of parked.values()) disposeTree(p.object)
  parked.clear()
}
export const parkedCount = () => parked.size

/**
 * The way the hero faces at the start of the take, as the compiler plays it: one rule for the facing arrow in both top views, the
 * live figure's front on the Set, and the compiler itself (its walk heads along smoothPath's first piece, which is firstLegYaw).
 * A walk starts facing along its first leg; a stand (or a path with fewer than two distinct points) faces the mark's yaw.
 */
import type { PerformancePlan } from '../contract.ts'
import { firstLegYaw, type Pt } from './path.ts'

/**
 * Degrees (0 = +z, as the contract). `markYawDeg`: the mark's facing (markOf, so an unfaced mark faces the nearest prop).
 * `startAt`: where the walk starts instead of its own first point (a mark being moved: every save snaps the start to the mark).
 */
export function startFacingDeg(perf: Pick<PerformancePlan, 'path' | 'stand'> | null | undefined, markYawDeg: number, startAt?: Pt): number {
  if (!perf || perf.stand) return markYawDeg
  const path = startAt && perf.path.length ? [startAt, ...perf.path.slice(1)] : perf.path
  const yaw = firstLegYaw(path)
  return yaw === null ? markYawDeg : (yaw * 180) / Math.PI
}

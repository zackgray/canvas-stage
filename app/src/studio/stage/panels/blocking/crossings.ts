// Extras crossing presets: the E114 spike's walk-past set (?extras=walkpast), re-expressed relative to the hero's path so they
// fit any drawn walk, not only the default one. The spike's figures, against the default walk [0.6,-12.5] -> [0.6,-8.0]:
// a runner crossing between the camera and him, one overtaking past his shoulder toward camera, one crossing just behind him,
// and two far back. "Ahead" is the hero's direction of travel (toward the master camera on the default walk).
import { EXTRA_COSTUME, type ExtraPlan } from '../../../../stage3d/contract'
import type { Pt } from './blockingMath'

export type CrossingId = 'front' | 'overtake' | 'behind' | 'far'

export const CROSSINGS: readonly { id: CrossingId; label: string; hint: string }[] = [
  { id: 'front', label: 'Cross in front', hint: 'runs across between the hero and the camera' },
  { id: 'overtake', label: 'Overtake past the shoulder', hint: 'comes up behind the hero and passes the shoulder toward camera' },
  { id: 'behind', label: 'Cross behind', hint: 'crosses just behind the hero' },
  { id: 'far', label: 'Far background', hint: 'walks across far behind the hero' },
]

const r2 = (v: number) => Math.round(v * 100) / 100

/**
 * One extra for a crossing preset, from the hero's path: start S, end E, travel direction h, his left l. `n` (how many extras
 * already exist) alternates the crossing's direction so two of the same preset do not run the same line.
 */
export function crossingExtra(id: CrossingId, hero: Pt[], n = 0, variants = 4): ExtraPlan {
  const S = hero[0], E = hero[hero.length - 1]
  let hx = E[0] - S[0], hz = E[1] - S[1]
  const L = Math.hypot(hx, hz) || 1
  hx /= L; hz /= L
  const lx = hz, lz = -hx // his left, as seen from the front, is picture right
  const at = (o: Pt, ahead: number, left: number): Pt => [r2(o[0] + hx * ahead + lx * left), r2(o[1] + hz * ahead + lz * left)]
  const flip = n % 2 ? -1 : 1, variant = n % Math.max(1, variants)
  switch (id) {
    case 'front': return { path: [at(E, -0.8, 6 * flip), at(E, -0.2, -6 * flip)], gait: 'run', delay: 0.7, costume: EXTRA_COSTUME, variant }
    case 'overtake': return { path: [at(S, -3.5, 2.2 * flip), at(E, 5, 3.2 * flip)], gait: 'run', delay: 0.2, costume: EXTRA_COSTUME, variant }
    case 'behind': return { path: [at(S, -3, -7 * flip), at(S, -2, 7 * flip)], gait: 'run', delay: 0, costume: EXTRA_COSTUME, variant }
    case 'far': return { path: [at(S, -13.5, -10 * flip), at(S, -15.5, 10 * flip)], gait: 'walk', delay: 1.2, costume: EXTRA_COSTUME, variant }
  }
}

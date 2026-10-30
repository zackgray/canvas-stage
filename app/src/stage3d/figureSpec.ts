// Stage3D figure builds: the height, shoulder width and bulk of one figure, as multipliers on the canonical mannequin (1 = the
// hero). Every figure is the same neutral mannequin (mannequin.ts); only its build varies, so a crowd is not clones. The hero is
// HERO_SPEC; an extra's build is a pure function of its variant index, so a take rebuilds the same crowd every time. Variants
// 0..7 are hand-picked to be pairwise distinct; a higher index repeats a row with its own small jitter.
import { rng } from './kit.ts'

/** height and bulk are multipliers on the canonical figure (1 = the hero); shoulder widens the chest only */
export type Build = { height: number; shoulder: number; bulk: number }
export type FigureSpec = { build: Build }

export const HERO_SPEC: FigureSpec = { build: { height: 1, shoulder: 1, bulk: 1 } }

// [height, shoulder, bulk]
const ROWS: [number, number, number][] = [
  [1.04, 1.12, 1.14], [0.93, 0.92, 0.88], [1.0, 1.0, 1.0], [1.08, 1.0, 0.9],
  [0.97, 1.16, 1.22], [1.02, 0.88, 0.94], [0.9, 1.06, 1.06], [1.06, 1.1, 0.96],
]

/** the build of extras variant `variant` */
export function extraSpec(variant: number): FigureSpec {
  const v = Math.max(0, Math.trunc(variant) || 0), [h, s, b] = ROWS[v % ROWS.length], r = rng(v * 7919 + 13)
  const jit = () => 1 + (r() - 0.5) * (v < ROWS.length ? 0 : 0.06)
  return { build: { height: h * jit(), shoulder: s * jit(), bulk: b * jit() } }
}

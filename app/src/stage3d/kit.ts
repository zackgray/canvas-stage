// Stage3D battlefield kit barrel. Builders live in ./kit/* by family; each family exports its pieces with arg specs.
// Frozen exports: KIT, clay, rng (consumed by world.ts, mannequin.ts and the studio). KIT_PIECES/KIT_ARGS are additive.
import type * as THREE from 'three'
import type { ArgSpec, Piece } from './kit/common.ts'
import { WOOD_PIECES } from './kit/wood.ts'
import { STRUCTURE_PIECES } from './kit/structures.ts'
import { NATURE_PIECES } from './kit/nature.ts'
import { PROP_PIECES } from './kit/props.ts'

export { clay, rng } from './kit/common.ts'
export type { ArgSpec, Piece }

/** every kit piece with its arg spec, footprint and description (plan.ts validates against this) */
export const KIT_PIECES: Record<string, Piece> = { ...WOOD_PIECES, ...STRUCTURE_PIECES, ...NATURE_PIECES, ...PROP_PIECES }

/** kit id -> builder; omitted trailing args take the spec defaults */
export const KIT: Record<string, (...args: number[]) => THREE.Object3D> = Object.fromEntries(
  Object.entries(KIT_PIECES).map(([k, p]) => [k, (...a: number[]) => p.build(...p.args.map((s, i) => a[i] ?? s.def))]),
)

/** kit id -> argument specs */
/** the piece for a kind, own keys only: a pasted "constructor" or "toString" is not a kit piece */
export const pieceOf = (kind: string): Piece | undefined => (Object.hasOwn(KIT_PIECES, kind) ? KIT_PIECES[kind] : undefined)

export const KIT_ARGS: Record<string, ArgSpec[]> = Object.fromEntries(Object.entries(KIT_PIECES).map(([k, p]) => [k, p.args]))

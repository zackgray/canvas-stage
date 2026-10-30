// The aim lock's target for a placed piece, on the world clock: a piece that carries a drawn path stands at its path point for
// take time t (prop movement: stage3d/propMove.ts, the same pose the kit layer's clock hook puts the mesh at), holds the path's
// end past it, and falls back to its resting place when the path is gone. The aim is the piece's middle, so its travel heading
// (which only turns the mesh about its own centre) does not move the aim point; the point itself follows the travel.
import { Vector3 } from 'three'
import type { KitItem } from '../../../stage3d/contract'
import { movePoseAt } from '../../../stage3d/propMove'

/** the world point to stay aimed at for `it` at take time t (`groundAt` is the kit's terrain height; `t` the world clock's time) */
export function pieceAimAt(it: KitItem, groundAt: (x: number, z: number) => number, t: number): Vector3 {
  const [x, z] = movePoseAt(it, t)?.at ?? it.at
  return new Vector3(x, groundAt(x, z) + 1, z) // about the piece's middle, table height
}

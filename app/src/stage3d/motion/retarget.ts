/**
 * Retarget a CMU clip onto the canonical skeleton: joint rotations are taken by name, bone offsets come from the canonical skeleton,
 * and the root translation (travel and height) is scaled by the leg-length ratio so stride and hip height fit the canonical legs.
 */
import { frameAt, sampleQuat, sampleRoot, type Bvh } from './bvh.ts'
import { legLength, skeletonOf, type Pose, type Skeleton } from './skeleton.ts'

export type Source = { bvh: Bvh; skel: Skeleton; /** canonical joint → source joint (-1 = none) */ map: number[]; ratio: number; duration: number }

export function retarget(bvh: Bvh, canon: Skeleton): Source {
  const skel = skeletonOf(bvh)
  const map = canon.names.map((n) => skel.index[n] ?? -1)
  const ratio = legLength(canon) / legLength(skel)
  return { bvh, skel, map, ratio, duration: (bvh.frames - 1) * bvh.frameTime }
}

/** the canonical pose of a source at file time t (s, clamped to the file); root in the clip's own space, metres */
export function sampleSource(src: Source, t: number, out: Pose): Pose {
  const f = frameAt(src.bvh, t)
  for (let j = 0; j < out.q.length; j++) {
    const s = src.map[j]
    if (s < 0) out.q[j].identity(); else sampleQuat(src.bvh, s, f, out.q[j])
  }
  sampleRoot(src.bvh, f, out.root).multiplyScalar(src.ratio)
  return out
}

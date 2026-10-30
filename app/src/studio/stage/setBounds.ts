// Where the set is, in metres (pure): the Top View and the Free view open on the performer's corner, but the planner may stand a
// prop 25-35 m away on a stand-in. These give the spread to frame, the pieces by distance for the Find list, and the spot just in
// front of the performer's mark that "Bring next to the performer" drops a far piece on.
import type { KitItem, MarkPlan } from '../../stage3d/contract'

type At = readonly [number, number]
const hyp = (a: At, b: At) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** the circle around the mark and every piece: where its centre is and how far its farthest point lies */
export function setBounds(kit: readonly KitItem[], mark: At): { cx: number; cz: number; radius: number } {
  const pts: At[] = [mark, ...kit.map((k) => k.at)]
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2
  return { cx, cz, radius: Math.max(...pts.map((p) => hyp(p, [cx, cz]))) }
}

/** every piece for the Find list, in plan order: its index, name and distance from the mark */
export function findList(kit: readonly KitItem[], mark: At): { index: number; name: string; metres: number; far: boolean }[] {
  return kit.map((k, index) => {
    const metres = hyp(k.at, mark)
    return { index, name: k.label?.trim() || k.kind, metres, far: metres > FAR_M }
  })
}

/** a piece farther than this from the mark is "far": said so in the list */
export const FAR_M = 12

/** a spot 2.5 m ahead of the mark along its facing (yaw 0 = +z), to the 2nd decimal */
export function nearMark(mark: Pick<MarkPlan, 'at'> & { yawDeg?: number }): [number, number] {
  const a = ((mark.yawDeg ?? 0) * Math.PI) / 180
  const r = (v: number) => Math.round(v * 100) / 100
  return [r(mark.at[0] + Math.sin(a) * 2.5), r(mark.at[1] + Math.cos(a) * 2.5)]
}

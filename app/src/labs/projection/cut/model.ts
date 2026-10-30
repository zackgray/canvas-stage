/**
 * The cut model (pure; shared by the Cut page and server/cut). Takes of one performance share its clock by
 * construction: render frame i is performance frame `sourceStart + i`. A segment names a take and a half-open range
 * [in, out) of PERFORMANCE frames; segments are contiguous (each starts where the last ended), so a cut from take A to
 * take B at frame k keeps the action continuous. Default take per segment: finished > reskin > realism > final > draft.
 */
export const CUT_FPS = 24

export type TakeKind = 'draft' | 'final' | 'realism' | 'reskin' | 'finished'
const RANK: Record<TakeKind, number> = { finished: 5, reskin: 4, realism: 3, final: 2, draft: 1 }

export interface CutTake {
  /** `<warp folder>/<file stem>`, unique. */
  id: string
  warpFolder: string
  kind: TakeKind
  file: string
  url: string
  width: number
  height: number
  /** Frames in the file. */
  frames: number
  /** Performance frame of the take's frame 0. */
  sourceStart: number
  hasAudio: boolean
  stamp: string
}

export interface CutSegment { takeId: string; in: number; out: number }

/** Performance-clock range a take covers: [sourceStart, sourceStart + frames). */
export const takeRange = (t: CutTake): [number, number] => [t.sourceStart, t.sourceStart + t.frames]

/** Frame of the take's own file that shows performance frame `f`. */
export const takeFrame = (t: CutTake, f: number): number => f - t.sourceStart

/** Takes of one warp folder (one camera move): the best kind wins, newest stamp breaks ties. */
export function bestPerWarp(takes: CutTake[]): CutTake[] {
  const best = new Map<string, CutTake>()
  for (const t of takes) {
    const cur = best.get(t.warpFolder)
    if (!cur || RANK[t.kind] > RANK[cur.kind] || (t.kind === cur.kind && t.stamp > cur.stamp)) best.set(t.warpFolder, t)
  }
  return [...best.values()].sort((a, b) => a.warpFolder.localeCompare(b.warpFolder))
}

/** Clock range every take of the performance covers in common (the span a cut can always fill). */
export function commonRange(takes: CutTake[]): [number, number] | null {
  if (!takes.length) return null
  const a = Math.max(...takes.map((t) => t.sourceStart))
  const b = Math.min(...takes.map((t) => t.sourceStart + t.frames))
  return a < b ? [a, b] : null
}

/** A cut from `from` to `to` (performance frames) as one segment per take in `order`, split evenly. */
export function evenSegments(order: CutTake[], from: number, to: number): CutSegment[] {
  const n = order.length
  const edges = Array.from({ length: n + 1 }, (_, i) => Math.round(from + ((to - from) * i) / n))
  return order.map((t, i) => ({ takeId: t.id, in: edges[i], out: edges[i + 1] })).filter((s) => s.out > s.in)
}

/** Move the cut between segment `i` and `i+1` to clock frame `f`, kept inside both neighbours (>= 1 frame each). */
export function moveCut(segs: CutSegment[], i: number, f: number): CutSegment[] {
  if (i < 0 || i >= segs.length - 1) return segs
  const at = Math.min(Math.max(Math.round(f), segs[i].in + 1), segs[i + 1].out - 1)
  return segs.map((s, k) => (k === i ? { ...s, out: at } : k === i + 1 ? { ...s, in: at } : s))
}

/** Split the segment holding frame `f` there (same take on both sides until the user changes one). */
export function splitAt(segs: CutSegment[], f: number): CutSegment[] {
  const k = segs.findIndex((s) => f > s.in && f < s.out)
  if (k < 0) return segs
  return [...segs.slice(0, k), { ...segs[k], out: f }, { ...segs[k], in: f }, ...segs.slice(k + 1)]
}

/** Remove segment `k`; the previous one (or the next, for the first) absorbs its frames so the clock stays contiguous. */
export function removeSegment(segs: CutSegment[], k: number): CutSegment[] {
  if (segs.length < 2 || k < 0 || k >= segs.length) return segs
  const out = segs.filter((_, j) => j !== k).map((s) => ({ ...s }))
  if (k === 0) out[0].in = segs[0].in
  else out[k - 1].out = segs[k].out
  return out
}

export const retake = (segs: CutSegment[], k: number, takeId: string): CutSegment[] =>
  segs.map((s, j) => (j === k ? { ...s, takeId } : s))

/** Empty list = valid. Checks: at least one segment, positive length, contiguous, each inside its take's coverage. */
export function validateCut(segs: CutSegment[], takes: CutTake[]): string[] {
  const errs: string[] = []
  if (!segs.length) return ['A cut needs at least one segment.']
  const byId = new Map(takes.map((t) => [t.id, t]))
  segs.forEach((s, i) => {
    const t = byId.get(s.takeId)
    if (!Number.isInteger(s.in) || !Number.isInteger(s.out) || s.out <= s.in) errs.push(`Segment ${i + 1}: needs whole frames with out after in.`)
    if (!t) return void errs.push(`Segment ${i + 1}: take ${s.takeId} is not on disk.`)
    const [a, b] = takeRange(t)
    if (s.in < a || s.out > b) errs.push(`Segment ${i + 1}: frames ${s.in}-${s.out} are outside the take (${a}-${b}).`)
    if (i > 0 && s.in !== segs[i - 1].out) errs.push(`Segment ${i + 1}: starts at ${s.in} but the one before ends at ${segs[i - 1].out}.`)
  })
  return errs
}

export const cutFrames = (segs: CutSegment[]): number => segs.reduce((n, s) => n + (s.out - s.in), 0)

/** Output size for a mixed-resolution cut: the largest width and height among the takes used (even numbers). */
export function outputSize(segs: CutSegment[], takes: CutTake[]): { width: number; height: number; mixed: boolean } {
  const used = segs.map((s) => takes.find((t) => t.id === s.takeId)).filter((t): t is CutTake => !!t)
  const even = (n: number) => n + (n % 2)
  const width = even(Math.max(0, ...used.map((t) => t.width)))
  const height = even(Math.max(0, ...used.map((t) => t.height)))
  return { width, height, mixed: used.some((t) => t.width !== used[0].width || t.height !== used[0].height) }
}

/** Where the segment list sits at clock frame `f` (for preview): segment index and the take's own frame. */
export function locate(segs: CutSegment[], takes: CutTake[], f: number): { index: number; take: CutTake; frame: number } | null {
  const index = segs.findIndex((s) => f >= s.in && f < s.out)
  const take = index < 0 ? undefined : takes.find((t) => t.id === segs[index].takeId)
  return take ? { index, take, frame: takeFrame(take, f) } : null
}

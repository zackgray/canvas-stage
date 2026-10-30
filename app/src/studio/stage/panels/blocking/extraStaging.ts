// Extras staging (pure): who stands where, which paths are too short to walk, and which named people nobody has staged yet.
// E140: an unstaged named person is invented by the render; E142: a 0.94 m path squeezed the start and stop clips into a lurch.
import { EXTRA_COSTUME, type ExtraPlan, type PathAction } from '../../../../stage3d/contract'
import type { BibleRecord } from '../../../../shared/bibleContract'
import { pathLength, type Pt } from './blockingMath'

/** metres: under this a walking or running figure cannot fit the start clip, a stride and the stop clip, and it lurches */
export const SHORT_PATH_M = 3
export const shortLine = 'Too short, the walk will lurch: stand them or make the path at least 3 m.'

/** true when this extra walks a path too short to walk (a stander, or a path not drawn yet, is not) */
export const tooShort = (e: ExtraPlan): boolean => !e.stand && e.path.length >= 2 && pathLength(e.path) < SHORT_PATH_M

/** the yaw (rad, 0 = +z, + toward +x) an extra faces at its start: a stander toward its face point (or the hero's start), a walker down its first leg */
export function startYaw(e: ExtraPlan, heroStart: Pt | null): number {
  const from = e.path[0]
  const to = e.stand ? (e.face ?? heroStart) : e.path[1]
  if (!from || !to || Math.hypot(to[0] - from[0], to[1] - from[1]) < 1e-6) return 0
  return Math.atan2(to[0] - from[0], to[1] - from[1])
}

/** degrees a head turns from the way the figure faces to look at ground point `to` (the motion's look: + toward +x of a +z facing), within -180..180 */
export function lookDeg(e: ExtraPlan, heroStart: Pt | null, to: Pt): number {
  const from = e.path[0]
  if (!from) return 0
  let d = ((Math.atan2(to[0] - from[0], to[1] - from[1]) - startYaw(e, heroStart)) * 180) / Math.PI
  while (d > 180) d -= 360
  while (d < -180) d += 360
  return Math.round(d)
}

/** the extra's looks (the actions the editor shows); other kinds are kept but not listed */
export const isLook = (a: PathAction) => a.kind === 'look'

/** the Bible's cast the scene names that are neither the hero (by cast card) nor an extra's tag: nobody has staged them */
export function unstagedPeople(bible: BibleRecord | null, heroCastId: string, extras: ExtraPlan[]): { tag: string; label: string }[] {
  if (!bible || !heroCastId) return []
  const staged = new Set(extras.flatMap((e) => (e.tag ? [e.tag] : [])))
  return bible.elements.filter((el) => el.kind === 'cast' && el.cardId !== heroCastId && !staged.has(el.tag)).map((el) => ({ tag: el.tag, label: `@${el.tag}` }))
}

/** a standing extra for a named person: beside the hero's start, a little ahead of him, facing him; `n` alternates sides */
export function standingExtra(tag: string, hero: Pt[], n: number, variants: number): ExtraPlan {
  const S = hero[0], E = hero[hero.length - 1] ?? S
  let hx = E[0] - S[0], hz = E[1] - S[1]
  const L = Math.hypot(hx, hz)
  hx = L > 1e-6 ? hx / L : 0; hz = L > 1e-6 ? hz / L : 1
  const side = (n % 2 ? -1 : 1) * (2.5 + Math.floor(n / 2) * 1.5), r2 = (v: number) => Math.round(v * 100) / 100
  const at: Pt = [r2(S[0] + hx * 2 + hz * side), r2(S[1] + hz * 2 - hx * side)]
  return { path: [at], gait: 'walk', delay: 0, costume: EXTRA_COSTUME, variant: n % Math.max(1, variants), tag, stand: true, face: [S[0], S[1]] }
}

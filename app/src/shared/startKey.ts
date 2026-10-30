/**
 * The stale rule and the frame-0 key (Wave B contract), moved out of shotContract.ts in Wave 0.5 to keep it under its size
 * limit; shotContract.ts re-exports both, so import them from there. Pure.
 */
import type { CameraSample } from '../labs/controller/take/types.ts'
import type { HeroStill, TakeRecord } from './shotContract.ts'

/** True when the still no longer shows the take's opening: its start camera, focal or performance frame changed. */
export function isStale(still: Pick<HeroStill, 'takeId' | 'startKey'>, take: Pick<TakeRecord, 'id' | 'startKey'>): boolean {
  return still.takeId !== take.id || still.startKey !== take.startKey
}

/**
 * True when a kit take's still was drawn for another cast card than the one the world's performance names now (Played by changed
 * after the draw). `castId`: the world's current pick (null = nobody named). A still made before castId was recorded passes.
 * Render's readiness (server/l2r/inputs.ts castMoved) and Shoot's hero list (useHeroStill.ts) use this one rule.
 */
export function castStale(still: Pick<HeroStill, 'castId'>, castId: string | null | undefined): boolean {
  return still.castId !== undefined && (castId ?? null) !== still.castId
}

/** the stale badge's hover line for a start change (another take, start camera, focal or performance frame) */
export const STALE_START = "The take's start camera or performance frame changed after this still was made"

/**
 * Why the still reads stale, in the owner's words, or null when it does not: the reason the hero strip's stale badge names on
 * hover. The same two rules as Render (isStale, castStale), the first that holds wins. `castId` undefined = the cast is not known.
 */
export function staleWhy(still: Pick<HeroStill, 'takeId' | 'startKey' | 'castId'>, take: Pick<TakeRecord, 'id' | 'startKey'>, castId?: string | null): string | null {
  if (isStale(still, take)) return STALE_START
  if (castId !== undefined && castStale(still, castId)) return 'Played by changed after this still was made: it shows another cast card'
  return null
}

const r4 =(n: number) => (Math.round(n * 1e4) / 1e4).toFixed(4)

/**
 * A stable hash of what frame 0 shows: the camera pose (position, quaternion, rounded to 1e-4), the focal and the
 * performance frame. Same inputs give the same key in the browser and on the server (FNV-1a 32, hex).
 */
export function startKey(s0: Pick<CameraSample, 'position' | 'quaternion'>, focal: number, perfStart: number): string {
  const text = [...s0.position, ...s0.quaternion, focal].map(r4).join(',') + `|${Math.round(perfStart)}`
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}

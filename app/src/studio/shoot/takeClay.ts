import { useEffect, useSyncExternalStore } from 'react'
import { getClay, type Fetch } from '../../labs/projection/clay/api'
import { exportClay, performanceMismatch, worldMismatch, type ClayProgress } from '../../labs/projection/clay/exportClay'
import type { Stage } from '../../labs/projection/engine/Stage'
import { KIT_CHANGED } from '../../labs/projection/stage3d/kitApi'
import type { PackTiming } from '../../labs/projection/performance/frames'
import type { ClayExport, TakeRecord } from '../../shared/shotContract'
import type { MassingClay } from '../../../server/pieces/massingClay'
export type { MassingClay } from '../../../server/pieces/massingClay'

/** The progress line under the Prepare button (and the hero still's while it prepares them first). */
export function clayLine(p: ClayProgress | null): string | null {
  if (!p) return null
  if (p.phase === 'encode') return `Encoding the frames… ${p.done}/${p.total}`
  return p.phase === 'capture' ? `Preparing the frames… ${p.done}/${p.total}` : `Shading the frames… ${p.done}/${p.total}`
}

/** A cache-safe URL for the clay video (a re-export overwrites clay.mp4 in place). */
export const clayUrl = (c: ClayExport) => (c.mp4 ? `${c.mp4}?v=${encodeURIComponent(c.finishedAt ?? c.startedAt ?? '')}` : null)

/** The take's clay is done, made from the take as locked now and from the set as it stands (not `setMoved`), with the take's own
 *  walk (a stamped packId that is another walk's is not prepared: the server refuses every press on it; an unstamped older clay
 *  passes) on the take's set (a stamped setKey that is another set's is not prepared, the same way), and carries the per-frame depth a kit still is drawn on. Frames behind are prepared again by the draw, free. */
export const depthReady = (c: ClayExport | null | undefined, take: Pick<TakeRecord, 'startKey'> & { packId?: string | null; setKey?: string } | null): boolean =>
  !!c && !!take && c.status === 'done' && c.startKey === take.startKey && !!c.depth && !c.setMoved && !stampedOtherWalk(c, take) && !stampedOtherSet(c, take)

/** the clay was captured with another walk than the take's (its packId stamp); an unstamped clay never is */
export const stampedOtherWalk = (c: Pick<ClayExport, 'packId'>, take: { packId?: string | null }): boolean =>
  c.packId !== undefined && take.packId !== undefined && c.packId !== (take.packId ?? null)

/** the clay was captured on another set than the take's (its setKey stamp, S2); an unstamped clay, or a take with no set key,
 *  never is */
export const stampedOtherSet = (c: { setKey?: string | null }, take: { setKey?: string }): boolean =>
  c.setKey !== undefined && take.setKey !== undefined && c.setKey !== take.setKey

/** the take's frames were made before a piece was built or moved on its set (the server says so on GET /__lab/clay) */
export const framesBehindSet = (c: ClayExport | null | undefined): boolean => !!c && c.status === 'done' && !!c.setMoved

/** Said on the Camera panel, the take card and under the draw while the take's frames show the set as it was */
export const SET_BEHIND = "The set changed since this take's frames were prepared. Draw the first frame prepares them again from the set as it stands (free, the same take and camera move), then draws."

/**
 * (recipe wave) The take's massing clay, made in the same Prepare as the precise clay when the set has generated pieces with massing
 * meshes (kitExport.ts massing mode): shots/<take>/clay/massing/{massing.mp4, final_NNN.png, zdepth_NNN.png, massing.json}.
 * Model-facing: the still's depth control and the Layout-To-Render video read it; null = none for this start (use the precise clay).
 */
export async function getMassingClay(takeId: string, f: Fetch = fetch): Promise<MassingClay | null> {
  const res = await f(`/__lab/pieces/massing?take=${encodeURIComponent(takeId)}`, { cache: 'no-store' })
  return res.ok ? (await res.json()) as MassingClay : null
}

// One record per take, shared by every block that shows it (the lock block's Prepare button and the hero still, which prepares
// the frames itself before a draw): an export run from either is seen by both, and its "needs the frames" warning clears.
interface Held { clay: ClayExport | null; error: string | null; progress: ClayProgress | null }
const EMPTY: Held = { clay: null, error: null, progress: null }
let held = new Map<string, Held>()
const running = new Map<string, Promise<ClayExport | null>>()
const subs = new Set<() => void>()
const put = (id: string, patch: Partial<Held>) => { held = new Map(held).set(id, { ...(held.get(id) ?? EMPTY), ...patch }); subs.forEach((f) => f()) }
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }

/** the clay record the server answered for a take (also how a test puts one there) */
export const noteClay = (takeId: string, clay: ClayExport | null) => put(takeId, { clay })

/** tests only */
export function resetClayStore() { held = new Map(); running.clear() }

/**
 * The locked take's clay: what is on disk (read when the locked take changes; one still shading on the server, e.g. after a
 * remount, is re-read every 2 s until it ends), and Prepare (free: capture in the page, upload, shade or encode on the server).
 * `run` resolves to the clay it made (null when it failed or could not start); a second call while one runs awaits the same one.
 */
export function useClayExport(stage: Stage | null, locked: TakeRecord | null, pack: (PackTiming & { id: string }) | null, worldId: string, f?: Fetch) {
  const id = locked?.id ?? null
  const all = useSyncExternalStore(subscribe, () => held)
  const h = (id && all.get(id)) || EMPTY
  const { clay, error, progress } = h

  useEffect(() => {
    if (!id) return
    let alive = true
    const read = () => { getClay(id, f).then((c) => { if (alive && !running.has(id)) noteClay(id, c) }).catch(() => { /* no clay yet */ }) }
    read()
    // a piece built or moved on the set: the server may now say these frames are behind it (setMoved), so read the record again
    if (typeof window !== 'undefined') window.addEventListener(KIT_CHANGED, read)
    return () => { alive = false; if (typeof window !== 'undefined') window.removeEventListener(KIT_CHANGED, read) }
  }, [id, f])

  // a clay shading on the server that this page is not following (a remount): read it until it ends
  const serverRunning = !progress && (clay?.status === 'running' || clay?.status === 'queued')
  useEffect(() => {
    if (!serverRunning || !id) return
    const t = setInterval(() => { getClay(id, f).then((c) => c && noteClay(id, c)).catch(() => {}) }, 2000)
    return () => clearInterval(t)
  }, [serverRunning, id, f])

  const blocked = !locked ? 'Lock the take first.' : !stage ? 'Waiting for the stage…' : worldMismatch(locked, worldId) ?? performanceMismatch(locked, pack)
  const busy = progress !== null || serverRunning

  /** `packNow`: the performer on the stage as of the call (stillPrep waits for the take's walk, then passes it: this render's
   *  `pack` may be the one before it) */
  const run = (packNow: (PackTiming & { id: string }) | null = pack): Promise<ClayExport | null> => {
    const why = packNow === pack || !locked || !stage ? blocked : worldMismatch(locked, worldId) ?? performanceMismatch(locked, packNow)
    if (!locked || !stage || why) return Promise.resolve(null)
    const forId = locked.id
    const inFlight = running.get(forId)
    if (inFlight) return inFlight
    if (serverRunning) return Promise.resolve(null)
    put(forId, { error: null, progress: { phase: 'capture', done: 0, total: locked.frames } })
    const p = exportClay(stage, locked, packNow, worldId, (pr) => put(forId, { progress: pr }), { fetch: f })
      .then((c) => { put(forId, { clay: c, progress: null }); return c })
      .catch((e: unknown) => { put(forId, { error: e instanceof Error ? e.message : String(e), progress: null }); return null })
      .finally(() => { running.delete(forId) })
    running.set(forId, p)
    return p
  }

  const line = clayLine(progress) ?? (serverRunning ? clayLine({ phase: clay?.method === 'browser' ? 'encode' : 'shade', done: clay?.done ?? 0, total: clay?.frames ?? 0 }) : null)
  return { clay, progress, line, error, blocked, running: busy, run }
}

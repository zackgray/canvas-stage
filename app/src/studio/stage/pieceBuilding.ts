// Whether a 3D piece build runs right now on a world: the ONE answer the Stage's steps block, the words drawer's Redraw and every
// usePieces (the piece panel, the Set panel, the rail) read, so they never disagree. While a build runs the server refuses Draw and
// Render with a 409 for about a minute, so those presses say so and wait. Three things count: the pieces route's own state (its
// `running`, or a tile it calls building: polled, one poll per world shared by every reader, started by the first and stopped with
// the last, and fed by every usePieces read), a press of Build in 3D on this page (from the moment it is pressed, not the next
// poll), and a Stage-made prop's automatic build (pieceAutoBuild.ts, from the moment it is started). Read-only: it never builds,
// recovers or places anything; usePieces does that, and a second usePieces here would place a landed mesh twice.
import { useEffect, useSyncExternalStore } from 'react'
import { KIT_CHANGED } from '../../labs/projection/stage3d/kitApi'
import { autoBuildsOf, subscribeAutoBuilds } from '../scene/pieceAutoBuild'
import { piecesApi, type PiecesApi, type PiecesResponse } from '../scene/piecesApi'
import type { Primary } from '../screens/primaryAction'

export const BUILD_POLL_MS = 3000
/** the presses' title and the steps block's line while a build runs */
export const PIECE_BUILDING = 'A 3D piece is building (about a minute); Draw and Render wait'

/** the steps block's Render press while a build runs: a paid render waits (Export and the free Finish do not) */
export const holdForBuild = (p: Primary, building: boolean): Primary =>
  (building && p.action === 'l2r' ? { ...p, disabled: true, why: PIECE_BUILDING } : p)

/** the pieces route's answer read as "a build is in the air" */
export const serverBuilding = (d: PiecesResponse | null | undefined): boolean =>
  !!d && (!!d.running || (Array.isArray(d.tiles) && d.tiles.some((t) => t.status === 'building')))

interface Watch { server: boolean; readers: number; timer: ReturnType<typeof setInterval> | null; off: (() => void) | null }
const watches = new Map<string, Watch>()
/** world -> tag -> when this page pressed Build in 3D (one record per world, replaced on change: a stable snapshot) */
const presses = new Map<string, Record<string, number>>()
const NONE: Record<string, number> = Object.freeze({}) as Record<string, number>
const subs = new Set<() => void>()
let api: PiecesApi = piecesApi()

/** tests: the route the poll reads (jsdom has none); null puts the real one back and forgets every watch and press */
export function setPieceBuildApi(a: PiecesApi | null): void {
  for (const w of watches.values()) { if (w.timer) clearInterval(w.timer); w.off?.() }
  watches.clear()
  presses.clear()
  api = a ?? piecesApi()
}

const tell = () => subs.forEach((f) => f())

/** a usePieces read of the route: the shared answer follows it at once (no reader waits for the next poll) */
export function notePieces(world: string, d: PiecesResponse | null): void {
  const w = watches.get(world), on = serverBuilding(d)
  if (w && w.server !== on) { w.server = on; tell() }
}

/** a press of Build in 3D on this page started (true) or ended (false) */
export function notePress(world: string, tag: string, on: boolean): void {
  const cur = presses.get(world) ?? NONE
  if (on === (tag in cur)) return
  const next = { ...cur }
  if (on) next[tag] = Date.now(); else delete next[tag]
  if (Object.keys(next).length) presses.set(world, next); else presses.delete(world)
  tell()
}

async function read(world: string): Promise<void> {
  const w = watches.get(world)
  if (!w) return
  let on: boolean
  try { on = serverBuilding(await api.get(world)) } catch { return /* no pieces route (an old server) or a failed read: the last answer stands */ }
  if (watches.get(world) === w && w.server !== on) { w.server = on; tell() }
}

function watch(world: string): () => void {
  let w = watches.get(world)
  if (!w) {
    const fresh: Watch = { server: false, readers: 0, timer: null, off: null }
    watches.set(world, fresh)
    fresh.timer = setInterval(() => void read(world), BUILD_POLL_MS)
    // a build started, landed or placed on this page is read at once, not at the next tick
    const on = (e: Event) => { if ((e as CustomEvent<{ id?: string }>).detail?.id === world) void read(world) }
    window.addEventListener(KIT_CHANGED, on)
    fresh.off = () => window.removeEventListener(KIT_CHANGED, on)
    void read(world)
    w = fresh
  }
  const mine = w
  mine.readers++
  return () => {
    if (--mine.readers > 0 || watches.get(world) !== mine) return
    if (mine.timer) clearInterval(mine.timer)
    mine.off?.()
    watches.delete(world)
  }
}

const subscribe = (f: () => void) => {
  subs.add(f)
  const offAuto = subscribeAutoBuilds(f)
  return () => { subs.delete(f); offAuto() }
}

/** true while a build is in the air on this world (the server's, this page's press, or an automatic one) */
function isPieceBuilding(world: string | null): boolean {
  if (!world) return false
  return !!watches.get(world)?.server || (presses.get(world) ?? NONE) !== NONE || Object.keys(autoBuildsOf(world).busy).length > 0
}

/** true while a 3D piece build runs (this page's, another tab's, or one a reload left in the air); false off a world */
export function usePieceBuilding(world: string | null): boolean {
  useEffect(() => (world ? watch(world) : undefined), [world])
  return useSyncExternalStore(subscribe, () => isPieceBuilding(world))
}

/** tag -> when this page pressed Build in 3D on this world (every usePieces copy sees the same presses) */
export function usePiecePresses(world: string | null): Record<string, number> {
  return useSyncExternalStore(subscribe, () => (world ? presses.get(world) ?? NONE : NONE))
}

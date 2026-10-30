// The automatic "Build in 3D" of a prop made on the Stage (owner decision 2026-10-28: a prop builds itself at its approval step,
// when its picked candidate is placed, never per image drawn). The press is the pieces route's own (piecesApi.build: priced, one
// Cloud job of about a minute, its intent written before the wait, the day budget and every free refusal the server's), started
// at most once per world and tag for this page's life. While it runs every usePieces on that world counts it as busy, so the
// button, a second placement or a remounted panel never start it again (a reload finds the server's own "building" state); a
// refusal stays as a plain line on the piece panel until a manual press clears it. Nothing here spends on its own: start() is
// only ever called by the placement. (add-prop-review, owner 2026-10-29) A prop approved while another automatic build on its
// set runs waits its turn and starts, once, when that one ends (the server builds one at a time); it was dropped before.
import { kitChanged, type PiecesApi } from './piecesApi'

type Entry = { since: number } | { error: string } | { waiting: number; api: Pick<PiecesApi, 'build'> }
const entries = new Map<string, Entry>()
const started = new Set<string>()
const subs = new Set<() => void>()
let version = 0
const key = (world: string, tag: string) => `${world} ${tag}`
const emit = () => { version++; for (const f of subs) f() }
const say = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** the line the piece panel shows when the automatic build was refused or failed (the stand-in stays) */
export const autoFailed = (why: string) => `The 3D build did not run: ${why.replace(/\.$/, '')}. It stays a stand-in; Build this in 3D tries again.`

/** the line for a prop approved while another automatic build on its set is still running: it starts once that one ends */
export const AUTO_WAIT = 'Waiting for the other piece of this set to finish building; this one starts by itself right after.'

/** start the one automatic build of this tile; false (nothing sent now) when it was already started on this page, or another
 *  automatic build on the same set is still running: then it waits its turn and is sent once that one ends (one at a time) */
export function startAutoBuild(api: Pick<PiecesApi, 'build'>, world: string, tag: string): boolean {
  const k = key(world, tag)
  if (started.has(k)) return false
  started.add(k)
  if (Object.keys(autoBuildsOf(world).busy).length > 0) { entries.set(k, { waiting: Date.now(), api }); emit(); return false }
  send(api, world, tag)
  return true
}

function send(api: Pick<PiecesApi, 'build'>, world: string, tag: string): void {
  const k = key(world, tag)
  entries.set(k, { since: Date.now() })
  emit()
  void api.build(world, tag)
    .then(() => { entries.delete(k) }, (e: unknown) => { entries.set(k, { error: autoFailed(say(e)) }) })
    .finally(() => { emit(); kitChanged(world); next(world) })
}

/** the oldest prop waiting on this set, sent once nothing else of it builds */
function next(world: string): void {
  if (Object.keys(autoBuildsOf(world).busy).length > 0) return
  let first: [string, { waiting: number; api: Pick<PiecesApi, 'build'> }] | null = null
  for (const [k, e] of entries) if (k.startsWith(`${world} `) && 'waiting' in e && (!first || e.waiting < first[1].waiting)) first = [k, e]
  if (first) send(first[1].api, world, first[0].slice(world.length + 1))
}

/** a manual press on this tile: its automatic refusal line goes */
export function clearAutoBuild(world: string, tag: string): void {
  if (entries.delete(key(world, tag))) emit()
}

/** the world's automatic builds: running ones (tag -> when it started), waiting ones (tag -> when it was approved) and
 *  refused ones (tag -> the plain line) */
export function autoBuildsOf(world: string | null): { busy: Record<string, number>; waiting: Record<string, number>; failed: Record<string, string> } {
  const busy: Record<string, number> = {}, waiting: Record<string, number> = {}, failed: Record<string, string> = {}
  if (!world) return { busy, waiting, failed }
  for (const [k, e] of entries) {
    if (!k.startsWith(`${world} `)) continue
    const tag = k.slice(world.length + 1)
    if ('since' in e) busy[tag] = e.since; else if ('waiting' in e) waiting[tag] = e.waiting; else failed[tag] = e.error
  }
  return { busy, waiting, failed }
}

/** for useSyncExternalStore */
export const subscribeAutoBuilds = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
export const autoBuildsVersion = () => version

/** tests: forget every automatic build */
export function resetAutoBuilds(): void { entries.clear(); started.clear(); emit() }

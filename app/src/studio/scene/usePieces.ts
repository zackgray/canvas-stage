// The Set step's generated set pieces: each approved prop tile's state read from the server (so a reload shows a build still in
// the air, or a paid one to Recover), Build in 3D, Recover, and what follows a placement: the world re-read (the piece shows in the
// set) and the set's clay view rendered again once, free, in the page. (set viewport) It re-reads on KIT_CHANGED too, so a piece moved
// on the Set (or a re-read world) is noticed at once; redraws run one at a time, and `stillRev` counts them, so every still.png the
// page shows carries a version and is never the browser's cached copy of an older set. A Stage-made prop's automatic build
// (pieceAutoBuild.ts) counts as busy here like a press of this page's, and `pieceBuilding` says plainly that a build is in the air
// (this page's, the automatic one, or another tab's): Draw and Render refuse with a 409 while it runs. Presses and that answer are
// the page's one store (stage/pieceBuilding.ts), so every copy of this hook, the steps block and the words drawer agree.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ScenePlan } from '../../stage3d/contract'
import { getKitWorld, KIT_CHANGED, uploadKitStill, type KitWorld } from '../../labs/projection/stage3d/kitApi'
import { renderKitStill } from '../../labs/projection/stage3d/kitStill'
import { kitChanged, piecesApi, type PiecesApi, type PiecesResponse, type PieceTileState } from './piecesApi'
import { AUTO_WAIT, autoBuildsOf, autoBuildsVersion, clearAutoBuild, subscribeAutoBuilds } from './pieceAutoBuild'
import { notePieces, notePress, serverBuilding as buildingIn, usePieceBuilding, usePiecePresses } from '../stage/pieceBuilding'
import { gateSetEdit, readOnlySet } from '../../labs/projection/stage3d/setEditGate'
import { useTakeOnShow } from '../../labs/projection/stage3d/takeOnShow'

/** re-rendering the set's clay view after a piece lands or moves (tests fake it: no WebGL there) */
export interface StillDeps { read: (id: string) => Promise<Pick<KitWorld, 'plan'>>; render: (plan: ScenePlan) => Promise<Blob>; upload: (id: string, png: Blob) => Promise<unknown> }
export const DEFAULT_STILL: StillDeps = { read: (id) => getKitWorld(id), render: renderKitStill, upload: uploadKitStill }
const DEFAULT_API = piecesApi()
export const POLL_MS = 3000

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function usePieces(world: string | null, api: PiecesApi = DEFAULT_API, still: StillDeps = DEFAULT_STILL) {
  const [data, setData] = useState<PiecesResponse | null>(null)
  /** tag -> when this page pressed (the button's clock; shared by every copy of this hook) */
  const pressed = usePiecePresses(world)
  const autoV = useSyncExternalStore(subscribeAutoBuilds, autoBuildsVersion, autoBuildsVersion)
  const auto = useMemo(() => autoBuildsOf(world), [world, autoV]) // eslint-disable-line react-hooks/exhaustive-deps -- autoV is the store's version
  /** tag -> when its build started: this page's presses and the world's automatic builds */
  const busy = useMemo(() => ({ ...auto.busy, ...pressed }), [auto.busy, pressed])
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    if (!world) return setData(null)
    // a reply without the tiles list is no panel, as an old server is (the poll would crash reading it)
    try { const d = await api.get(world); setData(Array.isArray(d?.tiles) ? d : null) } catch { /* no pieces route (an old server): no panel */ }
  }, [world, api])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { // a piece moved, built or removed (this page or a re-read): the set's changedAt and the still's age, read again
    const on = (e: Event) => { if ((e as CustomEvent<{ id?: string }>).detail?.id === world) void refresh() }
    window.addEventListener(KIT_CHANGED, on)
    return () => window.removeEventListener(KIT_CHANGED, on)
  }, [world, refresh])

  // a build running (this page's, another tab's, or one a reload left in the air): read again until it ends
  const serverBuilding = buildingIn(data)
  useEffect(() => { if (world) notePieces(world, data) }, [world, data])
  const live = serverBuilding || Object.keys(auto.busy).length > 0
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(t)
  }, [live, refresh])

  const after = useCallback(async () => { if (world) kitChanged(world); await refresh() }, [world, refresh])

  // a mesh that landed (recovered elsewhere, or the dev server restarted after the download): place it, free, once per run
  const placing = useRef(new Set<string>())
  useEffect(() => {
    if (!world || !data) return
    for (const t of data.tiles) {
      if (t.status !== 'landed' || !t.run || placing.current.has(t.run)) continue
      placing.current.add(t.run)
      void api.complete(world, t.tag, t.run).catch((e: unknown) => setError(`@${t.tag} could not be placed: ${msg(e)}`)).finally(() => void after())
    }
  }, [world, data, api, after])

  // the clay view, rendered again from the plan as the server has it now (free, in the page; the stand-in rules are renderKitStill's
  // own). One at a time: a later one waits, so an older plan's picture never lands after a newer one's.
  const [stillRev, setStillRev] = useState(0)
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  const redraw = useCallback((): Promise<void> => {
    if (!world) return Promise.resolve()
    const next = chain.current.catch(() => {}).then(async () => {
      const w = await still.read(world)
      await still.upload(world, await still.render(w.plan))
      setStillRev((n) => n + 1)
    })
    chain.current = next
    return next
  }, [world, still])

  // the clay view predates the last piece change: render it once more so the board shows the set as it stands. A failed redraw
  // (a piece's mesh not served yet) keeps its error up with a free Try again, which renders the clay view from the plan anew.
  const redrawn = useRef<string | null>(null)
  const [redrawFailed, setRedrawFailed] = useState(false)
  const redrawNow = useCallback(() => {
    setRedrawFailed(false)
    return redraw().then(() => { setError(null); return after() })
      .catch((e: unknown) => { setRedrawFailed(true); setError(`The set's clay view was not redrawn: ${msg(e)}`) })
  }, [redraw, after])
  useEffect(() => {
    if (!world || !data?.stillStale || !data.setChangedAt || redrawn.current === data.setChangedAt) return
    redrawn.current = data.setChangedAt
    void redrawNow()
  }, [world, data, redrawNow])
  const retryRedraw = () => { setError(null); void redrawNow() }

  const run = async (tag: string, fn: () => Promise<unknown>) => {
    if (world) notePress(world, tag, true)
    setError(null)
    setRedrawFailed(false)
    try { await fn() } catch (e) { setError(`@${tag}: ${msg(e)}`) } finally {
      if (world) notePress(world, tag, false)
      await after()
    }
  }
  // (per-take set) a locked take on show with its own other set: the paid build would land in the scene's set unseen, so the press
  // is off up front and refused before anything is sent (setEditGate.ts, the one gate every set write passes)
  const onShow = useTakeOnShow() // re-read the gate when the take on show changes
  const setReadOnly = useMemo(() => readOnlySet(world) !== null, [world, onShow, data]) // eslint-disable-line react-hooks/exhaustive-deps -- the gate reads its stores
  const build = (t: PieceTileState) => {
    if (!world || busy[t.tag]) return Promise.resolve()
    try { gateSetEdit(world) } catch (e) { setError(msg(e)); return Promise.resolve() }
    clearAutoBuild(world, t.tag)
    return run(t.tag, () => api.build(world, t.tag))
  }
  const recover = (t: PieceTileState) => (world && t.recover && t.run && !busy[t.tag] ? run(t.tag, () => api.recover(world, t.tag, t.run!, t.recover!.jobId)) : Promise.resolve())
  /** a piece build is in the air on this world (Draw and Render refuse with a 409 until it ends) */
  const pieceBuilding = usePieceBuilding(world)
  /** tag -> why its automatic build did not run (the stand-in stays), or that it waits its turn behind another build */
  const autoFailed = useMemo(() => ({ ...Object.fromEntries(Object.keys(auto.waiting).map((t) => [t, AUTO_WAIT])), ...auto.failed }), [auto])
  return { data, busy, error, autoFailed, pieceBuilding, setReadOnly, build, recover, refresh, redraw, stillRev, redrawFailed, retryRedraw }
}

export type PiecesState = ReturnType<typeof usePieces>

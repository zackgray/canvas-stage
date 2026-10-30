// The Set's composing state (Track C; set viewport): what is picked (a piece or the subject's mark, one selection for every view),
// the live poses a drag or a nudge draws in every view before its save lands, what the toolbar does to the pick (scale, turn,
// remove, its words, a kind swap, add, put back) and the last refusal, in words. Every change goes through `api` (setPlaceApi.ts): the piece route a
// top-view drag uses, and the mark route. A saved pose is held until the re-read plan shows it; a refused one snaps back.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { KitItem } from '../../stage3d/contract'
import { markOf } from '../../stage3d/mark'
import { LIMITS } from '../../stage3d/planRules'
import type { KitWorld } from '../../labs/projection/stage3d/kitApi'
import { readOnlySet, SET_READ_ONLY, SetReadOnlyError } from '../../labs/projection/stage3d/setEditGate'
import { movePiece, labelPiece, swapPiece } from '../stage/panels/blocking/usePieceDrag'
import { pickKey, type Pose, type Poses, type SetPick } from './live/liveSet'
import { currentSceneId } from '../../library/currentScene'
import { placeApi, plainSay, type PlaceApi } from './setPlaceApi'
import { clampScale, MAX_PIECE_M, scaleRangeOf } from './pieceScale'

export const SCALE_STEP = 1.05
export const TURN_STEP = 5
/** L4: one raise/lower press, metres, clamped to the plan's own lift range (LIMITS.lift) */
export const LIFT_STEP = 0.1
const clampLift = (v: number) => Math.min(LIMITS.lift[1], Math.max(LIMITS.lift[0], v))
/** an arrow nudge (m); Shift: NUDGE_BIG */
export const NUDGE = 0.25, NUDGE_BIG = 1
/** a run of nudges saves once, this long after the last */
export const NUDGE_SAVE_MS = 350
const norm = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180
const r2 = (v: number) => Math.round(v * 100) / 100
const say = (e: unknown) => plainSay(e instanceof Error ? e.message : String(e))

/** the pick on each scene's world, for this page's life: leaving the Stage (Board, Render) and coming back finds it picked again
 *  (owner 2026-10-28: the person's panel had closed). Only inside a scene: with none open there is nothing to come back to. */
const lastPick = new Map<string, SetPick | null>()
const pickKeyOf = (world: KitWorld | null) => { const scene = currentSceneId(); return scene && world ? `${scene}|${world.id}` : null }
const remembered = (world: KitWorld | null): SetPick | null => {
  const k = pickKeyOf(world), p = k ? lastPick.get(k) ?? null : null
  return typeof p === 'number' && p >= (world?.plan.kit.length ?? 0) ? null : p // a piece removed since is not picked
}

export function useSetPlace(world: KitWorld | null, api: PlaceApi = placeApi) {
  const [sel, setPieceSel] = useState<number | null>(() => { const p = remembered(world); return typeof p === 'number' ? p : null })
  const [onMark, setOnMark] = useState(() => remembered(world) === 'mark')
  const [error, setError] = useState<string | null>(null)
  /** the last piece removed, so one press puts it back */
  const [removed, setRemoved] = useState<KitItem | null>(null)
  const [poses, setPoses] = useState<Poses>({})
  const id = world?.id ?? null, plan = world?.plan ?? null, kit = plan?.kit ?? []
  const item = sel !== null ? kit[sel] ?? null : null
  const pick: SetPick | null = onMark ? 'mark' : sel
  // a plan that reads differently (the re-read after a save) is the truth again: drop the held poses (a re-read of the same plan
  // keeps them, so a run of nudges still waiting to save is not lost)
  const planKey = plan ? JSON.stringify(plan) : null
  useEffect(() => { setPoses({}) }, [planKey])
  const nudging = useRef<{ t: ReturnType<typeof setTimeout>; flush: () => void } | null>(null)
  useEffect(() => () => { if (nudging.current) clearTimeout(nudging.current.t) }, [])

  const select = useCallback((p: SetPick | null) => { setOnMark(p === 'mark'); setPieceSel(typeof p === 'number' ? p : null) }, [])
  useEffect(() => { const k = pickKeyOf(world); if (k) lastPick.set(k, pick) }, [world, pick])
  /** the top view's layer says which piece it picked (it never says "none": Esc and an empty click do) */
  const setSel = useCallback((i: number | null) => { if (i !== null) select(i) }, [select])
  // a locked take on show with its own other set (setEditGate.ts): nothing moves, nothing is sent, the refusal is said once
  const readOnly = () => readOnlySet(id) !== null
  const setLive = useCallback((p: SetPick, pose: Pose | null) => setPoses((x) => {
    if (pose && readOnlySet(id)) return x
    const n = { ...x }
    if (pose) n[pickKey(p)] = pose; else delete n[pickKey(p)]
    return n
  }), [id])
  const poseOf = (p: SetPick): Pose | null => {
    const live = poses[pickKey(p)]
    if (live) return live
    if (p === 'mark') { if (!plan) return null; const m = markOf(plan); return { at: m.at as [number, number], yaw: m.yawDeg } }
    const it = kit[p]
    return it ? { at: [it.at[0], it.at[1]], yaw: it.yawDeg ?? 0 } : null
  }

  const run = useCallback(async (job: () => Promise<void>, what: string) => {
    setError(null)
    if (readOnlySet(id)) { setError(SET_READ_ONLY); return }
    try { await job() } catch (e) { setError(`${what}: ${say(e)}`) }
  }, [id])

  /** save a pick's place and facing: held where it was put until the plan shows it; a refusal snaps it back and is thrown on */
  const commit = async (p: SetPick, pose: Pose): Promise<void> => {
    if (!id) return
    setLive(p, pose)
    try {
      if (p === 'mark') await api.mark(id, pose.at, pose.yaw)
      else { const it = kit[p]; if (!it) return; await (api.move ?? movePiece)(id, p, it.kind, pose.at, pose.yaw) }
    } catch (e) { setLive(p, null); throw e }
  }
  /** a drop from any view: saved, a refusal said in words */
  const drop = (p: SetPick, pose: Pose) => run(() => commit(p, pose), p === 'mark' ? 'The mark was not moved' : `${kit[p]?.kind ?? 'The piece'} was not moved`)
  /** an arrow press: drawn at once, saved once the presses stop */
  const nudge = (dx: number, dz: number) => {
    if (pick === null) return
    if (readOnly()) { setError(SET_READ_ONLY); return }
    const p = poseOf(pick)
    if (!p) return
    const next: Pose = { at: [r2(p.at[0] + dx), r2(p.at[1] + dz)], yaw: p.yaw }
    setLive(pick, next)
    if (nudging.current) clearTimeout(nudging.current.t)
    const flush = () => { nudging.current = null; void drop(pick, next) }
    nudging.current = { t: setTimeout(flush, NUDGE_SAVE_MS), flush }
  }

  /** size the piece to `v` (a multiplier on its own size), held to its range (pieceScale.ts); stopping at the top is said in words.
   *  Absolute, so a size measured from where a tool began is saved as shown, whether or not the last save's re-read has landed. */
  const scaleTo = async (v: number) => {
    if (!item || !id || sel === null) return
    const s = clampScale(item, v), capped = v > scaleRangeOf(item)[1] + 0.005
    await run(async () => {
      await api.edit(id, sel, item.kind, { scale: s })
      if (capped) setError(`${item.label?.trim() || item.kind} stops at about ${MAX_PIECE_M} m across, its largest on the Stage.`)
    }, `${item.kind} was not resized`)
  }
  const scaleBy = (f: number) => (item ? scaleTo((item.scale ?? 1) * f) : Promise.resolve())
  /** L4: raise/lower the piece above the ground (its plan `lift`, metres); the mark has no height */
  const liftBy = (d: number) => item && id && sel !== null ? run(() => api.edit(id, sel, item.kind, { lift: clampLift(r2((item.lift ?? 0) + d)) }), `${item.kind} was not raised`) : Promise.resolve()
  const turnBy = (deg: number) => {
    if (pick === 'mark') { const p = poseOf('mark'); return p ? drop('mark', { at: p.at, yaw: norm(p.yaw + deg) }) : Promise.resolve() }
    return item && id && sel !== null ? run(() => api.edit(id, sel, item.kind, { yawDeg: norm((item.yawDeg ?? 0) + deg) }), `${item.kind} was not turned`) : Promise.resolve()
  }
  /** (prop-movement wave) nudge the piece's base tilt (pitch or roll, degrees), clamped to the plan's tilt range */
  const tiltBy = (axis: 'pitchDeg' | 'rollDeg', deg: number) => item && id && sel !== null
    ? run(() => api.edit(id, sel, item.kind, { [axis]: Math.min(LIMITS.pitch[1], Math.max(LIMITS.pitch[0], (item[axis] ?? 0) + deg)) }), `${item.kind} was not tilted`)
    : Promise.resolve()
  /** (prop-movement wave) square the piece up: turn and base tilt all back to 0 */
  const resetRotation = () => item && id && sel !== null
    ? run(() => api.edit(id, sel, item.kind, { yawDeg: 0, pitchDeg: 0, rollDeg: 0 }), `${item.kind}'s rotation was not reset`)
    : Promise.resolve()
  /** (front-faces) where a built mesh's front is: its own turn offset (degrees), which travel facing leads with */
  const setFront = (deg: number) => item && id && sel !== null
    ? run(() => api.edit(id, sel, item.kind, { frontDeg: deg }), `${item.kind}'s front was not saved`)
    : Promise.resolve()
  /** (prop-movement wave) give the piece a travel along a drawn path, or clear it (null); the resting place stays the path's start */
  const setMove = (move: KitItem['move'] | null) => item && id && sel !== null
    ? run(() => api.edit(id, sel, item.kind, { move }), `${item.kind}'s path was not saved`)
    : Promise.resolve()
  const remove = () => {
    if (!item || !id || sel === null) return Promise.resolve()
    const gone = item
    return run(async () => { await api.edit(id, sel, gone.kind, { remove: true }); setRemoved(gone); select(null) }, `${gone.kind} was not removed`)
  }
  const undo = () => {
    if (!removed || !id) return Promise.resolve()
    const back = removed
    return run(async () => { await api.add(id, back as never); setRemoved(null) }, 'The piece was not put back')
  }
  const saveLabel = (label: string) => item && id && sel !== null ? run(() => (api.label ?? labelPiece)(id, sel, item.kind, label), `${item.kind}'s words were not saved`) : Promise.resolve()
  const swap = (swapTo: string) => item && id && sel !== null ? run(() => (api.swap ?? swapPiece)(id, sel, item.kind, swapTo), `${item.kind} was not swapped`) : Promise.resolve()
  /** a new piece at `at` (a free spot when unset), picked once it lands; `pieceTag` makes it a prop tile's stand-in. True = it landed.
   *  `o.throws`: a refusal is also thrown, in the route's own words, to a caller that says it elsewhere (the Add dialog) */
  const add = async (kind: string, at?: [number, number], label?: string, pieceTag?: string, o?: { throws?: boolean }): Promise<boolean> => {
    if (!id) { if (o?.throws) throw new Error('no set is open'); return false }
    // a locked take on show with its own other set: refused before anything is sent, and a caller that says it elsewhere (the
    // rail's Add, a drawn prop) is told why in the gate's words, not a generic "did not take"
    if (readOnlySet(id)) { setError(SET_READ_ONLY); if (o?.throws) throw new SetReadOnlyError(); return false }
    let landed = false
    let why: unknown = null
    await run(async () => {
      try {
        await api.add(id, at ? { kind, at, ...(label?.trim() ? { label: label.trim() } : {}), ...(pieceTag ? { pieceTag } : {}) } : { kind })
      } catch (e) { why = e; throw e }
      landed = true
      select(kit.length)
    }, `${kind} was not added`)
    if (!landed && o?.throws && why) throw why
    return landed
  }
  const saveMark = (at: [number, number], yawDeg: number) => commit('mark', { at, yaw: yawDeg })
  /** the top view's piece drag saves through here, so every view holds the dropped pose too */
  const savePiece = (_w: string, index: number, _kind: string, at: [number, number], yawDeg: number) => commit(index, { at, yaw: yawDeg })

  return { world, sel, setSel, pick, select, item, error, setError, removed, poses, setLive, poseOf, drop, nudge, scaleBy, scaleTo, liftBy, turnBy, tiltBy, resetRotation, setMove, setFront, remove, undo, saveLabel, swap, add, saveMark, savePiece }
}

export type SetPlaceState = ReturnType<typeof useSetPlace>

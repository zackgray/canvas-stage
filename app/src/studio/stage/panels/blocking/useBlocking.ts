// Blocking's state over one kit world (merge step 6c: lives with the Stage's panels; Save is live — decision 4): the draft
// (hero path, actions on its points, extras, pace, gait, who plays him), which path a click on the top view draws, the
// selected point, the scene sheet's tags, and live-save through the existing performance route (free; saveKitPerformance
// fires KIT_CHANGED so the viewport rebuilds the performer at once). Every edit saves itself, debounced; a refusal shows
// the server's plain sentence and the draft stays, un-retried until another edit changes the plan. The edit operations
// live in blockingOps.ts; this hook owns the state and the derived lines. Off a kit world everything idles empty.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ExtraPlan } from '../../../../stage3d/contract'
import type { BibleRecord } from '../../../../shared/bibleContract'
import { saveKitPerformance, type KitWorld } from '../../../../labs/projection/stage3d/kitApi'
import { readOnlySet } from '../../../../labs/projection/stage3d/setEditGate'
import { setTakeAside } from '../../../shoot/takeShow'
import type { KitPerformance } from '../../../../../server/stage3d/types'
import { markOf } from '../../../../stage3d/mark'
import { liftSpots } from '../../../../stage3d/props/liftSpots'
import { footprintHits, type Pt } from './blockingMath'
import { actionOps, creatureOps, extraOps, heroOps, reachLine, type OpsCtx } from './blockingOps'
import { changedFrom, draftFrom, perfKey, planOf, reanchor, samePerf, DEFAULT_PACE, type BlockingDraft } from './blockingPlan'
import { extrasVariants, readBible } from './bibleTags'
import { lookDeg, unstagedPeople } from './extraStaging'
import { MAX_PATH_POINTS, pathFullLine, saveReason } from './saveReason'

/** what a click on the top view does: add to the hero's path, to one extra's path (or its spot, for a stander), set where an extra
 *  faces or looks, or select a hero point */
export type Target = { kind: 'hero' } | { kind: 'extra'; n: number } | { kind: 'face'; n: number } | { kind: 'look'; n: number } | { kind: 'select' }

/** ms an edit waits for the next before the save goes out: bursts of clicks and draughts land as one save */
export const SAVE_DEBOUNCE_MS = 600
/** the unobtrusive word under a draft that matches the last save */
export const SAVED_LINE = 'Saved.'

const EMPTY_PERF: KitPerformance = { path: [] }
const emptyDraft = (): BlockingDraft => ({ path: [], actions: [], extras: [], creatures: [], pace: DEFAULT_PACE, gait: 'walk', castId: '' })

export function useBlocking(world: KitWorld | null) {
  const [draft, setDraft] = useState<BlockingDraft>(() => (world ? draftFrom(world.perf) : emptyDraft()))
  // the latest stored performance read (this panel's own save, or a newer one from outside): the draft is laid over it
  const [saved, setSaved] = useState<KitPerformance>(() => world?.perf ?? EMPTY_PERF)
  const [target, setTarget] = useState<Target>({ kind: 'select' })
  const [point, setPoint] = useState<number | null>(null)
  const [bible, setBible] = useState<BibleRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mark = world ? markOf(world.plan) : null
  // live-save plumbing: saves run one at a time, in order; a refused plan is not auto-retried
  const queue = useRef(Promise.resolve())
  const refused = useRef<string | null>(null)
  const latest = useRef(draft)
  latest.current = draft

  useEffect(() => {
    if (!world) { setBible(null); return }
    let live = true
    readBible(world.id).then((b) => { if (live) setBible(b) }, () => { if (live) setBible(null) })
    return () => { live = false }
  }, [world?.id])

  // a new world (its id): start fresh from its saved performance, as the old screen's key remount did. The ref starts at the
  // first world's id, so the mount itself is not reset — a child's own mount effects (a point pick's) run before this one
  // and must not be wiped.
  const seenId = useRef<string | null>(world?.id ?? null)
  useEffect(() => {
    if (!world || seenId.current === world.id) return
    seenId.current = world.id
    setSaved(world.perf); setDraft(draftFrom(world.perf)); setPoint(null); setTarget({ kind: 'select' })
    setNote(null); setError(null); refused.current = null
  }, [world?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // saved from outside this panel (the Played by row picked the hero, the shot length, another tab). An edit in progress is never
  // overwritten, but it is laid over the newer read from now on, so the save keeps what was saved elsewhere (a shot
  // length is not dropped). With no edit pending, show what is saved now and say so, instead of a stale draft.
  useEffect(() => {
    if (!world || samePerf(world.perf, saved)) return
    const pending = changedFrom(saved, draft, mark ?? undefined)
    setSaved(world.perf)
    if (pending) return
    setDraft(draftFrom(world.perf))
    setNote(world.perf.castId && world.perf.castId !== saved.castId ? 'Saved: the one picked in Played by now plays the hero. Nothing left to save.' : 'Saved elsewhere: this is the blocking on the set now. Nothing left to save.')
  }, [world?.perf]) // eslint-disable-line react-hooks/exhaustive-deps

  // (per-take set) the draft is the scene's walk: while a locked take with its own other set is on show, the first change sets that
  // take aside, so the path, Walk to and the mark readout measure against the scene's set the walk is saved on (takeShow.ts)
  const edit = (f: (d: BlockingDraft) => BlockingDraft) => {
    if (world && readOnlySet(world.id)) setTakeAside(world.id)
    setNote(null); setDraft(f)
  }
  const setPath = (f: (p: Pt[]) => Pt[]) => edit((d) => { const path = f(d.path); return { ...d, path, actions: reanchor(d.actions, path) } })
  const setExtra = (n: number, f: (e: ExtraPlan) => ExtraPlan) => edit((d) => ({ ...d, extras: d.extras.map((e, i) => (i === n ? f(e) : e)) }))
  const variants = extrasVariants(bible)
  // ops run only where the view renders (on a world); off one the draft idles empty and no control calls them
  const ctx: OpsCtx = { world: world as KitWorld, draft, point, variants, bible, edit, setPath, setExtra, setPoint, setTarget, setNote }

  const click = (p: Pt) => {
    if (target.kind === 'hero') return draft.path.length >= MAX_PATH_POINTS ? setNote(pathFullLine) : setPath((q) => [...q, p])
    if (target.kind === 'face') { setExtra(target.n, (e) => ({ ...e, face: p })); return setTarget({ kind: 'select' }) }
    if (target.kind === 'look') {
      const n = target.n, deg = lookDeg(draft.extras[n], draft.path[0] ?? null, p)
      setExtra(n, (e) => ({ ...e, actions: [...(e.actions ?? []), { kind: 'look', at: 0, seconds: 3, deg }] }))
      return setTarget({ kind: 'select' })
    }
    if (target.kind === 'extra' && draft.extras[target.n]?.stand) { setExtra(target.n, (e) => ({ ...e, path: [p] })); return setTarget({ kind: 'select' }) }
    if (target.kind === 'extra') {
      const n = target.n
      return (draft.extras[n]?.path.length ?? 0) >= MAX_PATH_POINTS ? setNote(pathFullLine) : setExtra(n, (e) => ({ ...e, path: [...e.path, p] }))
    }
    // select: the nearest hero point within 1.5 m
    let best = -1, d = 1.5
    draft.path.forEach((q, i) => { const k = Math.hypot(q[0] - p[0], q[1] - p[1]); if (k < d) { best = i; d = k } })
    setPoint(best >= 0 ? best : null)
  }

  const hero = heroOps(ctx), actions = actionOps(ctx), extras = extraOps(ctx), creatures = creatureOps(ctx)
  /** one point is a stand: actions go on it without a pick */
  const standing = draft.path.length === 1
  const selected = standing ? 0 : point
  const plan = planOf(saved, draft, mark ?? undefined)
  const changed = changedFrom(saved, draft, mark ?? undefined)
  const badExtra = draft.extras.findIndex((e) => e.path.length < (e.stand ? 1 : 2))
  const blocked = draft.path.length < 1 ? 'The hero path needs a start: press New path'
    : badExtra >= 0 ? (draft.extras[badExtra].stand ? `Extra ${badExtra + 1} needs a spot: click the ground` : `Extra ${badExtra + 1} needs at least two points`) : null
  const unstaged = unstagedPeople(bible, draft.castId || saved.castId || '', draft.extras)
  const reach = world ? reachLine(world.plan.kit, draft.path, draft.actions) : null
  const pathsKey = JSON.stringify([draft.path, draft.extras.map((e) => e.path), draft.actions])
  const through = useMemo(() => ({
    // the hive she lifts from is where her path is meant to end up: not "walks through it"
    hero: world ? footprintHits(world.plan.kit, draft.path).filter((i) => !liftSpots(draft.path, planOf(saved, draft, mark ?? undefined).actions, world.plan.kit).some((s) => s.piece === i)) : [],
    extras: draft.extras.map((e) => (world ? footprintHits(world.plan.kit, e.path) : [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [world?.plan, pathsKey])

  const send = async (p: KitPerformance, atSend: BlockingDraft) => {
    if (!world) return
    setBusy(true); setError(null)
    try {
      // a cast change is saved as it is: no costume (every figure is the one neutral mannequin)
      const w = await saveKitPerformance(world.id, p)
      setSaved(w.perf)
      // edits made while the save was in flight survive: the echoed read becomes the draft only when the draft is
      // still the one this save sent (else the pending draft saves next, laid over this read)
      if (JSON.stringify(latest.current) === JSON.stringify(atSend)) setDraft(draftFrom(w.perf))
      refused.current = null
    } catch (e) {
      setError(saveReason(e))
      refused.current = perfKey(p)
    } finally { setBusy(false) }
  }

  // live-save: an edit writes itself, debounced, through the performance route. Refused plans keep the draft and show
  // the server's sentence; they are not retried until another edit changes the plan (same refusal, same answer).
  const key = perfKey(plan)
  useEffect(() => {
    if (!world || !changed || blocked) return
    if (refused.current === key) return
    const atSend = draft
    const t = setTimeout(() => {
      queue.current = queue.current.then(() => send(plan, atSend)).catch(() => {})
    }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [key, changed, blocked, world?.id]) // eslint-disable-line react-hooks/exhaustive-deps -- plan and draft ride the key

  return { world, draft, saved, plan, changed, blocked, through, target, setTarget, point: selected, setPoint, standing, reach, click, hero, actions, extras, creatures, unstaged, bible, variants, busy, note, error }
}

export type Blocking = ReturnType<typeof useBlocking>

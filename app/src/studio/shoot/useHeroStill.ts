import { useCallback, useEffect, useRef, useState } from 'react'
import { isWaiting, JobDetached, JobRefused, WAITING } from '../../jobs/sceneJobs'
import { runningOf } from '../../jobs/scope'
import { sinceOf, useCurrentJobs, useJobConsumer, useJobRunning } from '../../jobs/useSceneJobs'
import { type HeroListResponse, type HeroRenderRequest, type HeroStill, type KeyframeRole, type TakeRecord } from '../../shared/shotContract'
import type { KitListExtra, KitRenderFields, KitStill, UnfinishedStill } from '../../../server/hero/kitSpec'
import type { DrawMode, LockPresetId } from '../../shared/stillPressContract'
import { staleWhy } from '../../shared/startKey'
import type {} from '../../shared/stillBible'
import { BIBLE_CHANGED } from '../scene/bibleApi'
import { TAKE_WORDS_CHANGED } from '../../shared/takeWordsContract'
import { useCurrentTakeId } from './currentTake'
import { useTakeCast } from './takeCast'
import { useAllTakes } from './worldTakes'
import { stillChanged } from '../render/l2rStore'
import { approveHero, unapproveHero, fetchHero, finishHero, HeroApiError, heroChanged, heroReply, onHeroChanged, recoverJob, renderHero, uploadOpening } from './heroApi'

const RUNNING_MS = 2500

/** Captures the take's frame 0 as a 1920x1088 PNG (heroCapture.ts; tests inject). */
export type CaptureOpening = (take: TakeRecord) => Promise<Blob>

/** one press: `seed` (with count 1) = "Draw again with this seed"; `preset` / `materials` (kit takes) = the preview card's lock and refs */
export interface RenderOpts { count: number; prompt: string; role?: KeyframeRole; frame?: number; price?: number | null; seed?: number; preset?: LockPresetId; materials?: string[]; mode?: DrawMode
  /** true = the finish takes the clothes from the scene's approved look frame (the Stage's opt-in); absent = the card's own picture */
  sameLook?: boolean
  /** (owner 10-29) the finish's words as edited in "What will be sent", sent as written; absent = the composed ones */
  finishPrompt?: string
  /** (prompt-fix pass) the draw words the app adds that this take switched off; absent = all on */
  drawAdds?: KitRenderFields['drawAdds'] }

export interface HeroState {
  /** the take Shoot's lock block locked and the set still matches (currentTake.ts), or null: "lock a take first". Never the
   *  newest take on disk: that may be another world's, and its opening would be captured from this one. */
  take: TakeRecord | null
  list: HeroListResponse | null
  phase: string | null
  /** when the running draw began (epoch ms: its job's start, else the server's), null when none runs or it is not known yet. A
   *  still listed after it is this press's (the working state is over), never a new press starting (owner 2026-10-28) */
  since: number | null
  error: string | null
  /** the Cloud job of the last failed press, when Cloud knows it: Recover fetches it, never resubmits */
  failedJob: string | null
  /** every still of the take; a kit still carries its role, frame, layout check and colour-match (KitStill) */
  stills: (KitStill & { stale: boolean; staleWhy?: string })[]
  /** `role` (kit takes): the keyframe to draw, opening by default; mid and end need no opening capture (the clay's depth is used);
   *  `frame`: the mid keyframe's picked clay frame (8-grid; absent = the middle) */
  render: (o: RenderOpts) => Promise<void>
  approve: (stillId: string) => Promise<void>
  unapprove: (stillId: string) => Promise<void>
  recover: (jobId: string) => Promise<void>
  /** kit draws whose Klein finish never ran (a budget stop or a restart between the two jobs) */
  unfinished: UnfinishedStill[]
  /** the paid Klein finish alone for those draws (~2 cr a still); never draws again */
  finish: (ids: string[], price?: number | null) => Promise<void>
  /** read the take's stills again (free): a Keep on an unapproved still made a new one */
  reload: () => void
  /** drop the last press's error (what it asked for is there now, e.g. the frames it needed) */
  clearError: () => void
  /** say why a press did not go out (a free refusal on this side, nothing sent) */
  fail: (message: string) => void
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
/** the server's running hero job is any take's (any scene's): only one of this take is shown here, never another scene's */
const ofTake = (l: HeroListResponse, takeId: string): HeroListResponse => ({ ...l, running: runningOf(l.running, takeId) })

export function useHeroStill(capture: CaptureOpening): HeroState {
  const [held, setTake] = useState<TakeRecord | null>(null)
  const [listed, setListed] = useState<{ id: string; list: HeroListResponse } | null>(null)
  const [phase, setPhase] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [failedJob, setFailedJob] = useState<string | null>(null)
  const busy = useRef(false)
  const alive = useRef(true)
  // a hero job of this scene, wherever it was pressed: the press stays off on every screen until it lands (M2)
  const jobs = useCurrentJobs()
  const drawingStill = useJobRunning(jobs, 'hero')
  const finishing = useJobRunning(jobs, 'heroFinish')
  const drawing = drawingStill ?? finishing
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  // the take the lock block just locked (a sibling block; read again at once when it changes); no fallback
  const wanted = useCurrentTakeId()
  // read from the page's one shared takes poll (worldTakes.ts), not a full-list poll of its own (fix 2026-10-30)
  const allTakes = useAllTakes()
  useEffect(() => {
    if (!wanted || !allTakes) return
    const pick = allTakes.find((t) => t.id === wanted) ?? null
    setTake((prev) => (prev && pick && prev.id === pick.id && prev.startKey === pick.startKey ? prev : pick))
  }, [wanted, allTakes])
  // only the current take: a take read for an earlier pick (or none now) is never the one shown or rendered
  const take = wanted && held?.id === wanted ? held : null
  const castId = useTakeCast(take)
  const takeRef = useRef(take)
  takeRef.current = take

  const refresh = useCallback(async (id: string) => {
    try { const l = await fetchHero(id); if (alive.current) setListed({ id, list: ofTake(l, id) }) } catch (e) { if (alive.current && !busy.current) setError(msg(e)) }
  }, [])
  const takeId = take?.id ?? null
  // a Bible write (a Brief detail edit in Scene), or a write of the take's own words (the take list), may stale a still or free one
  // again: the list says so at once (F1)
  useEffect(() => {
    if (!takeId) return
    const on = () => void refresh(takeId)
    window.addEventListener(BIBLE_CHANGED, on)
    window.addEventListener(TAKE_WORDS_CHANGED, on)
    // a version used or edited in the still view's strip (useFrameEdit): the right panel's Approve and the step cue follow at once
    const off = onHeroChanged(takeId, on)
    return () => { window.removeEventListener(BIBLE_CHANGED, on); window.removeEventListener(TAKE_WORDS_CHANGED, on); off() }
  }, [takeId, refresh])
  // a still that landed after this block was gone (another screen, a reload): its take's list read again, its reason said
  useJobConsumer(jobs, { intents: ['hero', 'heroFinish'], parse: (_j, r) => heroReply(r),
    apply: async (j, outcome) => {
      try { await outcome } catch (e) { if (alive.current && takeRef.current?.id === j.target) { setError(msg(e)); setFailedJob(e instanceof HeroApiError ? e.jobId : null) } }
      if (takeRef.current?.id === j.target) await refresh(j.target)
    } })
  const list = listed && listed.id === takeId ? listed.list : null
  const serverRunning = !!list?.running
  useEffect(() => {
    if (!takeId) return
    let stop = false
    fetchHero(takeId).then((l) => { if (!stop) setListed({ id: takeId, list: ofTake(l, takeId) }) }, (e) => { if (!stop) setError(msg(e)) })
    return () => { stop = true }
  }, [takeId])
  // while a hero job runs (this page or an earlier one), follow the listing
  useEffect(() => {
    if (!takeId || !(phase || serverRunning)) return
    const t = setInterval(() => void refresh(takeId), RUNNING_MS)
    return () => clearInterval(t)
  }, [takeId, phase, serverRunning, refresh])

  const render = useCallback(async ({ count, prompt, role, frame, price, seed, preset, materials, mode, sameLook, finishPrompt, drawAdds }: RenderOpts) => {
    if (!take || busy.current || jobs.running('hero') || jobs.running('heroFinish')) return
    busy.current = true
    setError(null); setFailedJob(null)
    try {
      const open = list?.opening
      if ((role ?? 'opening') === 'opening' && (!open?.present || open.startKey !== take.startKey)) {
        setPhase('Capturing the opening frame…')
        await uploadOpening(take.id, take.startKey, await capture(take))
      }
      setPhase('Rendering the still…')
      const req: HeroRenderRequest & KitRenderFields = { takeId: take.id, count, ...(prompt.trim() ? { prompt: prompt.trim() } : {}), ...(role && role !== 'opening' ? { role } : {}), ...(role === 'mid' && frame !== undefined ? { frame } : {}),
        ...(seed !== undefined ? { seed } : {}), ...(preset ? { preset } : {}), ...(materials ? { materials } : {}), ...(mode ? { mode } : {}), ...(sameLook ? { sameLook: true } : {}), ...(finishPrompt?.trim() ? { finishPrompt } : {}), ...(drawAdds ? { drawAdds } : {}) }
      await jobs.run({ intent: 'hero', target: take.id, price }, () => renderHero(req))
    } catch (e) {
      if (alive.current && !(e instanceof JobDetached)) { setError(e instanceof JobRefused ? e.message : msg(e)); setFailedJob(e instanceof HeroApiError ? e.jobId : null) }
    } finally {
      busy.current = false
      if (alive.current) setPhase(null)
      await refresh(take.id)
    }
  }, [take, list, capture, refresh, jobs])

  const approve = useCallback(async (stillId: string) => {
    if (!take) return
    setError(null)
    try { await approveHero(take.id, stillId) } catch (e) { setError(msg(e)) }
    await refresh(take.id)
    heroChanged(take.id) // the version strip marks it in use at once
    await stillChanged() // the Render press reads the approval at once
  }, [take, refresh])

  const unapprove = useCallback(async (stillId: string) => {
    if (!take) return
    setError(null)
    try { await unapproveHero(take.id, stillId) } catch (e) { setError(msg(e)) }
    await refresh(take.id)
    heroChanged(take.id)
    await stillChanged()
  }, [take, refresh])

  const recover = useCallback(async (jobId: string) => {
    if (!take) return
    setError(null); setPhase('Recovering the still…')
    try { await recoverJob(jobId); setFailedJob(null) } catch (e) { setError(msg(e)) } finally { setPhase(null); await refresh(take.id) }
  }, [take, refresh])

  const finish = useCallback(async (ids: string[], price?: number | null) => {
    if (!take || busy.current || jobs.running('hero') || jobs.running('heroFinish')) return
    busy.current = true
    setError(null); setFailedJob(null); setPhase('Finishing the drawn still…')
    try { await jobs.run({ intent: 'heroFinish', target: take.id, price }, () => finishHero(take.id, ids)) } catch (e) {
      if (alive.current && !(e instanceof JobDetached)) { setError(e instanceof JobRefused ? e.message : msg(e)); setFailedJob(e instanceof HeroApiError ? e.jobId : null) }
    } finally { busy.current = false; if (alive.current) setPhase(null); await refresh(take.id) }
  }, [take, refresh, jobs])

  const unfinished = (list as (HeroListResponse & KitListExtra) | null)?.unfinished ?? []
  // Render's own stale rules: another opening (startKey), a still drawn for a cast card the world no longer names, or a moved Bible
  const stills = (list?.stills ?? []).map((s: HeroStill) => {
    // F1: or one drawn from brief fields (light, place…) that have since changed; the server says why, in Render's words
    const why = take ? staleWhy(s, take, castId) ?? s.bibleWhy ?? null : null
    return { ...(s as KitStill), stale: !!why, ...(why ? { staleWhy: why } : {}) }
  })
  const clearError = useCallback(() => { setError(null); setFailedJob(null) }, [])
  const fail = useCallback((m: string) => { setError(m); setFailedJob(null) }, [])
  // queued behind another paid job (another scene's, or another section's): said as waiting, never as that job
  const shownPhase = drawing && isWaiting(drawing) ? WAITING : phase ?? (drawing ? (drawing.intent === 'heroFinish' ? 'Finishing the drawn still…' : 'Rendering the still…') : null)
  // a Keep on an unapproved still made a new one: the strip reads the take's stills again
  const reload = useCallback(() => { if (take) void refresh(take.id) }, [take, refresh])
  // when the running draw began: the job's own start (it survives a tab switch in the scene's job store), else the server's
  const since = sinceOf(drawing) ?? (list?.running?.since ? Date.parse(list.running.since) || null : null)
  return { take, list, phase: shownPhase, since, error, failedJob, stills, render, approve, unapprove, recover, unfinished, finish, clearError, fail, reload }
}

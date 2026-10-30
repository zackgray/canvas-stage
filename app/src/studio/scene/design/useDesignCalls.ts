// The Scene design's paid calls. Each runs from one click, once: every one is a job of the scene's job store (src/jobs), so a call
// already in flight under the same target is refused there, its button stays disabled on every screen that shows it, and its
// result is applied by whichever Scene screen is mounted when it lands (applyCalls.ts), also after leaving Scene or a reload (M1).
// No paid call here runs on its own (no effect calls any of it). `spent` adds each call's estimate once it has landed ok (m1: a
// refused or failed call costs nothing; a 422, an answer that failed the check twice, adds what its two jobs billed). The one effect is
// free: an approved person or creature saves its Cast card (cards.ts, wave 3 M1); Build the set awaits the same saver.
import { useCallback, useMemo, useRef, useState } from 'react'
import { retryCost, retryLine } from '../../../shared/bibleContract'
import type { JobIntent } from '../../../shared/libraryContract'
import { isWaiting, JobDetached, JobRefused, PRICE_LOADING, sceneJobs, WAITING, type SceneJobs } from '../../../jobs/sceneJobs'
import { useJobConsumer, useJobs } from '../../../jobs/useSceneJobs'
import { failedSpend, PlannerError, type BriefApi, type PieceType } from '../briefApi'
import { useCards } from './useCards'
import { applyFail, applyOk, settle, type ApplyCtx } from './applyCalls'
import { pieceCredits, shownOnBoard } from './model'
import type { Design } from './state'
import type { DesignState } from './useDesign'
import { useDevelop } from './useDevelop'
import { useGuidedCalls } from './useGuidedCalls'

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
/** what every concept draw carries besides its own words: the scene's lines and the chosen quality */
const looks = (x: { lighting: string; materials: string; quality: Design['quality'] }) => ({ lighting: x.lighting, materials: x.materials, quality: x.quality })
/** people and creatures are Cast front draws; every other kind a concept draw */
const drawIntent = (t: PieceType): JobIntent => (t === 'person' || t === 'creature' ? 'cast' : 'concept')
/** the design's paid jobs: the piece draws, and the front door's Develop it (useDevelop.ts) */
export const DESIGN_INTENTS: JobIntent[] = ['concept', 'cast', 'develop']
/** how one paid design call went (Generate the board can stop on a refusal from here, m10) */
export type PaidOutcome = { kind: 'ok' | 'gone' | 'refused' } | { kind: 'failed'; failure: unknown }
const NO_JOBS = sceneJobs(null)

export function useDesignCalls(s: DesignState, api: BriefApi, jobs: SceneJobs = NO_JOBS) {
  const inFlight = useRef(new Set<string>())
  const [local, setLocal] = useState<Record<string, number>>({}) // free recoveries: key -> when it started
  const [error, setError] = useState<string | null>(null)
  /** the last planner press that needed the internal retry: what it added (shown beside the spend; m1 counts it) */
  const [retry, setRetry] = useState<string | null>(null)
  const noteRetry = useCallback((n: number) => setRetry(n > 0 ? retryLine(n) : null), [])
  const { set } = s
  /** a press that failed but billed (a 422: both planner tries) is counted too, at what it billed (PRICES deferral) */
  const lose = useCallback((e: unknown) => { const n = failedSpend(e); if (n) set((y) => ({ spent: y.spent + n })) }, [set])
  const cards = useCards(s, api, setError)
  const x: ApplyCtx = useMemo(() => ({ s, setError }), [s])
  const ctx = useRef(x)
  ctx.current = x
  // finished design jobs this screen did not press (it was away, or the page reloaded) land here, once the draft is read back
  const owner = useJobConsumer(jobs, { intents: DESIGN_INTENTS, parse: api.parse, apply: async (j, o) => {
    if (!(await settle(ctx.current, j.target, o))) { lose(await o.then(() => null, (e: unknown) => e)); return }
    if (!j.price) return
    const extra = retryCost(await o.catch(() => null), j.price)
    set((y) => ({ spent: y.spent + j.price! + extra })); if (extra) noteRetry(extra)
  } }, s.synced)

  /**
   * One paid call as a job: refused (silently) while the same one runs; the answer applied by its target. Says how it went:
   * 'ok', 'failed' (the server refused or the job failed: `failure` is the error), 'gone' (this screen left; the next one applies
   * it) or 'refused' (nothing was sent).
   */
  const paid = useCallback(async (intent: JobIntent, target: string, credits: number, call: () => Promise<unknown>): Promise<PaidOutcome> => {
    if (jobs.running(intent, target)) return { kind: 'refused' }
    setError(null)
    try {
      const r = await jobs.run({ intent, target, price: credits, owner }, call)
      const extra = retryCost(r, credits) // the internal retry is billed too
      try { applyOk(ctx.current, target, r); set((y) => ({ spent: y.spent + credits + extra })); if (extra) noteRetry(extra); return { kind: 'ok' } } catch (e) { applyFail(ctx.current, target, e); return { kind: 'failed', failure: e } }
    } catch (e) {
      if (e instanceof JobDetached) return { kind: 'gone' }
      if (e instanceof JobRefused) { if (e.message === PRICE_LOADING) setError(e.message); return { kind: 'refused' } }
      applyFail(ctx.current, target, e)
      lose(e)
      return { kind: 'failed', failure: e }
    }
  }, [jobs, owner, set, noteRetry, lose])

  const snap = useJobs(jobs)
  /** target -> when it started, for every design job running in this scene (and the board's run of tiles) */
  const busy = useMemo(() => {
    const out: Record<string, number> = { ...local }
    for (const j of snap.jobs) if (j.status === 'running' && DESIGN_INTENTS.includes(j.intent)) out[j.target] = Date.parse(j.startedAt) || Date.now()
    if (snap.holds.board) out.board = snap.holds.board
    return out
  }, [snap, local])
  /** a design job of this scene queued behind another paid job (another scene's, or another kind): it starts by itself */
  const waiting = snap.jobs.some((j) => j.status === 'running' && DESIGN_INTENTS.includes(j.intent) && isWaiting(j))
  /** the board's tiles not drawn yet (a run stopped by a refusal, a closed tab or a reload): one priced press draws them, the same
   *  tiles Generate the board would send (a new @tile typed into the brief too). Look-types that are not tiles any more never draw. */
  const left = s.d.pieces.filter((p) => shownOnBoard(p) && p.state === 'draft' && !p.looks.length && !p.loading && !busy[`tile:${p.id}`])
  const rest = s.d.phase === 'board' && left.length > 0 && !busy.board
    ? { n: left.length, credits: left.reduce((n, p) => n + pieceCredits(p, s.d.quality), 0) } : null

  /** Draw the rest: one look for every draft tile not yet drawn, in order, each slot reserved before anything draws */
  const generateBoard = useCallback(() => {
    const x0 = s.ref.current
    // a tile whose draw is still out (sent before a reload, or waiting its turn) is not sent again
    const queue = x0.pieces.filter((p) => shownOnBoard(p) && p.state === 'draft' && !p.looks.length && !jobs.running(drawIntent(p.type), `tile:${p.id}`))
    if (jobs.held('board')) return
    void jobs.hold('board', async () => {
      const ids = new Set(queue.map((p) => p.id))
      set((y) => ({
        phase: 'generating', screen: 'board',
        pieces: y.pieces.map((p) => (ids.has(p.id) ? { ...p, onBoard: true, loading: true, problem: undefined } : p.state === 'yours' ? { ...p, onBoard: true } : p)),
      }))
      for (const [n, p] of queue.entries()) {
        const r = await paid(drawIntent(p.type), `tile:${p.id}`, pieceCredits(p, x0.quality),
          () => api.candidates({ type: p.type, prompt: p.line || p.name, count: 1, name: p.name, ...looks(s.ref.current) }))
        // a billed draw lost on its way back is that tile's own to recover (m3); it does not end the run
        if ((r.kind !== 'failed' && r.kind !== 'refused') || (r.kind === 'failed' && r.failure instanceof PlannerError && r.failure.jobId)) continue
        // m10: a refusal (a budget one comes back for every tile) ends the run: this tile and the ones not reached stop waiting, said once
        const rest = new Set(queue.slice(n).map((q) => q.id))
        set((y) => ({ pieces: y.pieces.map((q) => (rest.has(q.id) ? { ...q, loading: false } : q)) }))
        const credits = queue.slice(n).reduce((k, q) => k + pieceCredits(q, x0.quality), 0)
        setError(`Drawing the board stopped after ${n} of ${queue.length}: ${r.kind === 'failed' ? message(r.failure) : 'a draw could not be sent'}. Nothing was spent on the ${queue.length - n} not drawn yet; Draw the rest (≈ ${credits} cr) when you are ready.`)
        break
      }
      set({ phase: 'board' })
    }).catch(() => {})
  }, [s, jobs, paid, api, set])

  const redraw = useCallback((id: string) => {
    const p = s.ref.current.pieces.find((q) => q.id === id)
    if (!p || jobs.running(drawIntent(p.type), `piece:${id}`)) return
    s.patchPiece(id, { loading: true, problem: undefined, recover: undefined })
    void paid(drawIntent(p.type), `piece:${id}`, pieceCredits(p, s.ref.current.quality),
      () => api.candidates({ type: p.type, prompt: p.line || p.name, count: 1, name: p.name, ...looks(s.ref.current) }))
  }, [s, jobs, paid, api])

  /** m3: a billed draw lost on its way back (a restart mid-draw), fetched by id and put on its tile; free, never a new draw */
  const recover = useCallback((id: string) => {
    const r = s.ref.current.pieces.find((q) => q.id === id)?.recover
    const key = `recover:${id}`
    if (!r || inFlight.current.has(key)) return
    inFlight.current.add(key); setLocal((b) => ({ ...b, [key]: Date.now() })); setError(null)
    void api.recoverConcept(r.jobId, r.runId).then((out) => {
      set((y) => ({ pieces: y.pieces.map((q) => (q.id === id ? { ...q, looks: [...new Set([...q.looks, ...out.urls])], look: q.looks.length, problem: undefined, recover: undefined } : q)) }))
    }, (e: unknown) => setError(message(e))).finally(() => { inFlight.current.delete(key); setLocal((b) => { const n = { ...b }; delete n[key]; return n }) })
  }, [s.ref, api, set])

  /** an uploaded or dropped image as a real reference file (free); null when it was refused (the reason in `error`) */
  const upload = useCallback(async (f: File): Promise<string | null> => {
    setError(null)
    try { return await api.uploadReference(f) } catch (e) { setError(message(e)); return null }
  }, [api])

  // Guided's setters and piece draws (useGuidedCalls.ts)
  const guided = useGuidedCalls(s, api, jobs, paid)
  // the front door's box and its one paid press
  const develop = useDevelop(s, api, jobs, paid, guided.setG)

  return { busy, error: error ?? (waiting ? WAITING : null), waiting, retry, noteRetry, rest, restLabel: rest ? `Draw the rest (${rest.n})` : null, drawRest: generateBoard, setError, cards, upload, generateBoard, redraw, recover, develop, ...guided }
}
export type DesignCalls = ReturnType<typeof useDesignCalls>

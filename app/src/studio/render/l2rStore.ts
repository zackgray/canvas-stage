import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { isWaiting, JobDetached, JobRefused, jobFetch, WAITING } from '../../jobs/sceneJobs'
import { runningOf } from '../../jobs/scope'
import { currentJobs, useCurrentJobs, useJobRunning } from '../../jobs/useSceneJobs'
import { ROUTES, type L2RListResponse, type L2RRender, type TakeRecord, type TakesListResponse } from '../../shared/shotContract'
import { currentTakeId, onCurrentTake, setCurrentTake } from '../shoot/currentTake'
import type { HoldPreset } from '../../shared/renderFinishContract'
import { finishBody, holdFor, NO_PICKS, type FinishPicks } from './finishChoice'
import { GRADE_DEFAULT, type KeyName, type L2RRenderExtra, type L2RStatusExtra, type PromptPreview } from './l2rExtra'
import { defaultTake } from './l2rPick'
import { readTakePick, writeTakePick } from '../shoot/takePick'
import { displayName } from '../names'

/**
 * The Layout-To-Render state the Render screen shares: L2RBlock (the take, its still and clay, the player) and the screen's
 * primary button (RenderScreen) read the same store, so there is one poller and one "posting" flag. All state is the
 * server's: GET /__lab/takes and GET /__lab/l2r?take= are re-read while a render or a finish runs (a refresh shows the same).
 * One press = one POST; a 409 is not retried, the status is read back. The paid press is a job of the scene (src/jobs): refused
 * without a loaded price (m14) or while one runs, and a render that lands after a reload is read back when Render is open again.
 * The server's `running` is any scene's render: only one of the take on show counts here (another scene's never disables Render),
 * and a press queued behind another paid job says it is waiting.
 */
export interface L2RState {
  /** the takes route answers (T1 built); false = takes are not available yet */
  takesReady: boolean
  takes: TakeRecord[]
  takeId: string | null
  status: (L2RListResponse & L2RStatusExtra) | null
  posting: boolean
  /** POST finish / recover in flight */
  working: boolean
  error: string | null
  /** prompt override ('' = the one built from the world and the cast) */
  prompt: string
  seed: number
  /** a mid / end keyframe the owner has not ticked on: OFF by default (E140 A: an independently drawn keyframe morphs the set), sent only when switched on */
  keyOff: Record<KeyName, boolean>
  /** "Hold the clay" (wide / close-up) and the grade: the owner's picks; untouched ones follow the take / the render (finishChoice.ts) */
  picks: FinishPicks
  /** the prompt or the seed was changed since the last render landed (the next press renders again) */
  dirty: boolean
  /** the world on the set: only its takes are listed (null/undefined = every take, for the tests) */
  worldId?: string | null
  /** the take picked before is gone (deleted, or another world's): which take is shown instead, in words; null = the pick stands */
  pickNote?: string | null
  /** the owner set a seed (setSeed): it is sent as is; untouched, a render again draws from a fresh seed */
  seedSet?: boolean
}

const INITIAL: L2RState = { takesReady: false, takes: [], takeId: null, status: null, posting: false, working: false, error: null, prompt: '', seed: 42, keyOff: { mid: true, end: true }, picks: NO_PICKS, dirty: false }
let state: L2RState = INITIAL
/** what the owner typed or ticked for one world's render: another world (another scene's set) starts from none of it */
const UNTOUCHED = { prompt: INITIAL.prompt, seed: INITIAL.seed, seedSet: false, keyOff: INITIAL.keyOff, picks: NO_PICKS, dirty: false, pickNote: null }
const subs = new Set<() => void>()
const set = (patch: Partial<L2RState>) => { state = { ...state, ...patch }; subs.forEach((f) => f()) }
let timer: ReturnType<typeof setInterval> | null = null
let users = 0
let seq = 0
/** Shoot's current take when the takes were last loaded */
let seenShoot: string | null = null
/** the newest loadTakes call: an older one landing later never overwrites it (a world switch mid-load) */
let loads = 0

/** the line when a remembered pick is gone: which take is on show now */
export const goneNote = (gone: string, shown: string): string => `The take picked before (${displayName(gone)}) is gone: showing ${displayName(shown)}.`

const json = async <T>(r: Response): Promise<T | null> => ((r.headers.get('content-type') ?? '').includes('json') ? ((await r.json()) as T) : null)

/** a render claimed to run longer than this is not believed from the server's say-so alone (a stuck claim must not lock Render for good): the press is offered again, the server still has the last word */
export const STALE_RUN_MS = 45 * 60_000
const fresh = (since: string | undefined, now: number): boolean => { const t = since ? Date.parse(since) : NaN; return !Number.isFinite(t) || now - t < STALE_RUN_MS }

/** the server says a render of this take runs, and the claim is not stale */
export const serverRunning = (s: L2RState, now = Date.now()): boolean => !!s.status?.running && fresh(s.status.running.since, now)

/** a paid render of this take is out: this page's POST, or the server's record of it (not one stale past STALE_RUN_MS) */
export const isRenderBusy = (s: L2RState, now = Date.now()): boolean => s.posting || s.working || serverRunning(s, now) ||
  (s.status?.renders ?? []).some((r) => (r.status === 'running' || r.status === 'queued') && fresh(r.createdAt, now))

/** something runs: a render (this page's POST, or the server's record), or a finish of this take's renders (the server lists every scene's finishing renders: another scene's is not this take's) */
export const isBusy = (s: L2RState, now = Date.now()): boolean => isRenderBusy(s, now) ||
  (s.status?.finishing ?? []).some((id) => (s.status?.renders ?? []).some((r) => r.id === id))

function poll() {
  const want = isBusy(state) && users > 0
  if (want && !timer) timer = setInterval(() => void refresh(), 3000)
  if (!want && timer) { clearInterval(timer); timer = null }
}

export async function refresh(): Promise<void> {
  const id = state.takeId
  if (!id) return poll()
  const n = ++seq
  try {
    const r = await fetch(`${ROUTES.l2r}?take=${encodeURIComponent(id)}`, { cache: 'no-store' })
    const b = await json<L2RListResponse & L2RStatusExtra & { error?: string }>(r)
    if (n !== seq) return
    if (r.ok && b) set({ status: { ...b, running: runningOf(b.running, id) } })
    else set({ status: null, error: b?.error ?? `Render service answered ${r.status}` })
  } catch (e) { if (n === seq) set({ error: e instanceof Error ? e.message : String(e) }) }
  poll()
}

export async function loadTakes(): Promise<void> {
  const n = ++loads
  const world = state.worldId
  try {
    const r = await fetch(ROUTES.takes, { cache: 'no-store' })
    const b = r.ok ? await json<TakesListResponse>(r) : null
    if (n !== loads) return
    // only the world on the set: another scene's takes (and their renders) are never offered here
    const takes = [...(b?.takes ?? [])].filter((t) => !world || t.worldId === world).sort((a, c) => c.lockedAt.localeCompare(a.lockedAt))
    // the owner's pick (this page's, else the one remembered for the world: takePick.ts) stays until the Stage locks or picks
    // another take; then (and with no pick) the default: the Stage's take, else the most recently locked (l2rPick.ts). A pick
    // whose take is gone falls back, and says which take is shown instead
    const shoot = currentTakeId()
    const has = (id: string | null): id is string => !!id && takes.some((t) => t.id === id)
    const prior = state.takeId ?? readTakePick(world)
    const follow = shoot !== null && shoot !== seenShoot && has(shoot)
    const takeId = follow ? shoot : has(prior) ? prior : defaultTake(takes, shoot)
    if (n !== loads) return
    seenShoot = shoot
    const gone = !!b && !follow && !!prior && !has(prior)
    writeTakePick(world, takeId)
    set({ takesReady: !!b, takes, takeId, pickNote: gone && takeId ? goneNote(prior!, takeId) : takeId === state.takeId ? state.pickNote : null, ...(takeId ? {} : { status: null }) })
  } catch { if (n === loads) set({ takesReady: false, takes: [], takeId: null, status: null }) }
  await refresh()
}

// a take locked (or picked) while a render press is on screen is read at once: the Render gate and the Camera panel's
// "Take locked." always speak of the same take, with no reload
onCurrentTake(() => { if (users > 0) void loadTakes() })

/** The still was approved or unapproved elsewhere (the Stage's first frame): its render facts read again (free). */
export const stillChanged = (): Promise<void> => (users > 0 ? refresh() : Promise.resolve())

/** Scope the store to the world on the set: a new world drops the old one's take, renders and price, and lists its own takes. */
export function scopeWorld(worldId: string | null) {
  if (state.worldId === worldId) return
  seq++
  // a render still out for the old world is that world's: its posting flag and its error never show on this one
  set({ worldId, takes: [], takeId: null, status: null, error: null, posting: false, working: false, ...UNTOUCHED })
  if (users > 0) void loadTakes()
}

/** the owner's pick on Render's shots list: the one take Render, Export and the Stage's overlay read, remembered for the world. It
 *  is also the take on show on the Stage (as a reload finds it, useRestoreTake), so the Stage's Render press never says to lock a
 *  take while a locked one is picked here. A take recorded on the Stage afterwards supersedes the pick until it is locked (review F1) */
export function pick(takeId: string) {
  writeTakePick(state.worldId, takeId)
  set({ takeId, status: null, error: null, dirty: false, pickNote: null })
  setCurrentTake(takeId, true)
  void refresh()
}
export const setPrompt = (prompt: string) => set({ prompt, dirty: true })
/** (owner 10-29) the Stage's edited render words for the take on show: `dirty` when the owner just changed them, not when a stored
 *  edit is read back (that changes nothing the last render did not already send) */
export const overridePrompt = (prompt: string, dirty: boolean) => { if (state.prompt !== prompt) set({ prompt, ...(dirty ? { dirty: true } : {}) }) }
export const setKeyframe = (name: KeyName, on: boolean) => set({ keyOff: { ...state.keyOff, [name]: !on }, dirty: true })
/** the grade is the finish's switch now: changing it never makes the paid press "dirty", it only gives Finish again something to do */
export const setGrade = (strength: number | null) => set({ picks: { ...state.picks, gradeTouched: true, grade: strength === null ? null : Math.min(1, Math.max(0.1, strength || GRADE_DEFAULT)) } })
export const setHold = (hold: HoldPreset) => set({ picks: { ...state.picks, hold }, dirty: true })
export const setSeed = (seed: number) => set({ seed: Number.isInteger(seed) && seed >= 0 ? seed : 42, seedSet: true, dirty: true })
/** a new seed for a render again the owner gave no seed for (the server takes 0 to 2^31 - 1) */
const freshSeed = (): number => Math.floor(Math.random() * 2 ** 31)

async function post(path: string, body: object, flag: 'posting' | 'working', price?: number | null): Promise<L2RRender | null> {
  const world = state.worldId
  /** the studio still shows the world this was pressed on (another scene's Render may be open by the time it answers) */
  const here = () => state.worldId === world
  set({ [flag]: true, error: null })
  poll()
  try {
    const send = () => jobFetch(`${ROUTES.l2r}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    // the paid render as a job of the scene; recover and finish are free
    const r = flag === 'posting' ? await currentJobs().run({ intent: 'l2r', target: state.takeId ?? 'l2r', price }, send) : await send()
    const b = await json<{ render?: L2RRender; error?: string }>(r)
    if (!r.ok && here()) set({ error: b?.error ?? `HTTP ${r.status}` })
    return r.ok ? b?.render ?? null : null
  } catch (e) {
    if (!(e instanceof JobDetached) && here()) set({ error: e instanceof JobRefused ? e.message : e instanceof Error ? e.message : String(e) })
    return null
  } finally {
    if (here()) set({ [flag]: false })
    await refresh()
  }
}

/** a press with these ticks sends a mid or end guide (render() sends exactly these), so the keyframe surcharge is in its price */
export const sendsKeys = (s: L2RState): boolean => (['mid', 'end'] as const).some((n) => !!s.status?.keyframes?.[n] && !s.keyOff[n])

/** the price of the press as ticked: the keyed estimate when a guide is sent (none answered = no price, so the press stays off) */
export function priceOf(s: L2RState): number | null {
  if (!s.status?.estimate) return null
  return sendsKeys(s) ? s.status.estimateKeyed?.credits ?? null : s.status.estimate.credits
}

/** the paid press (first render or render again): one POST; the server refuses a second one while it runs (409). Its price is the
 *  one on the button (priceOf); while that has not loaded nothing is sent (m14). `wordsOnFrame`: the owner chose to render the
 *  take's words now on a first frame drawn from earlier words (the server refuses a words-changed press without it) */
export async function render(o: { wordsOnFrame?: boolean } = {}) {
  const price = priceOf(state)
  const s = state.status
  if (!state.takeId || !s?.still || state.posting) return null
  const extra: L2RRenderExtra = {}
  for (const n of ['mid', 'end'] as const) { const k = s.keyframes?.[n]; if (k && !state.keyOff[n]) extra[n] = k.still.id }
  // the first automatic finish uses what is picked now: the grade (only when touched on)
  if (state.picks.gradeTouched && state.picks.grade !== null && s.gradeTarget) extra.grade = { strength: state.picks.grade }
  extra.hold = holdFor(state.picks, s.take)
  // the first render of a take draws from the default seed; a render again from a fresh one, unless the owner set one
  const again = (s.renders ?? []).some((x) => x.status === 'done')
  const seed = again && !state.seedSet ? freshSeed() : state.seed
  const r = await post('', { takeId: state.takeId, stillId: s.still.id, seed, ...(state.prompt.trim() ? { prompt: state.prompt } : {}), ...(o.wordsOnFrame ? { wordsOnFrame: true } : {}), ...extra }, 'posting', price)
  if (r) set({ dirty: false }) // these settings are rendered now
  return r
}
/** the override with its @tags expanded as a render would send it (free); null when the route is not there */
export async function previewPrompt(text: string): Promise<PromptPreview | null> {
  if (!state.takeId) return null
  try {
    const r = await fetch(`${ROUTES.l2r}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ takeId: state.takeId, text }) })
    return r.ok ? await json<PromptPreview>(r) : null
  } catch { return null }
}
export const recover = (jobId: string) => post('/recover', { jobId }, 'working')
/** Finish again (free): the switches the owner touched ride along; the rest follows the render's record */
export const finish = (renderId: string) => post('/finish', finishBody(renderId, state.picks, !!state.status?.gradeTarget), 'working')

/** tests only */
export function resetL2RStore() { state = INITIAL; seq++; loads++; users = 0; seenShoot = null; if (timer) { clearInterval(timer); timer = null } }

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
const consumer = {}

/** `worldId`: the world on the set (the Render screen passes it); absent = leave the scope as it is */
export function useL2RState(worldId?: string | null): L2RState {
  const s = useSyncExternalStore(subscribe, () => state)
  // the scope is set before the first load, so a mount never lists another world's takes first
  if (worldId !== undefined && users === 0 && state.worldId !== worldId) state = { ...state, worldId, takes: [], takeId: null, status: null, posting: false, working: false, ...UNTOUCHED }
  useEffect(() => {
    users++
    if (users === 1) void loadTakes()
    // a render this page did not see land (a reload mid-render): its reason said, its take read again
    const release = currentJobs().own(consumer, { intents: ['l2r'],
      parse: async (_j, r) => { if (r.status >= 400) throw new Error((r.body as { error?: string } | null)?.error ?? `HTTP ${r.status}`); return r.body },
      apply: async (_j, outcome) => { try { await outcome } catch (e) { set({ error: e instanceof Error ? e.message : String(e) }) } await refresh() } })
    return () => { users--; release(); poll() }
  }, [])
  useEffect(() => { if (worldId !== undefined) scopeWorld(worldId) }, [worldId])
  // this take's render queued behind another paid job: said where the render's reasons are said, until it starts
  const job = useJobRunning(useCurrentJobs(), 'l2r', s.takeId ?? undefined)
  const waiting = isWaiting(job)
  return useMemo(() => (waiting && !s.error ? { ...s, error: WAITING } : s), [s, waiting])
}

/** The store as it stands, without loading or polling (the pipeline strip reads what Render last saw). */
export const useL2RSnapshot = (): L2RState => useSyncExternalStore(subscribe, () => state)

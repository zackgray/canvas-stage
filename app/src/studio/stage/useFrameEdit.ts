// "Edit this frame" (owner 10-28): the hook behind the edit box and version strip under the full-screen first frame (owner 10-29;
// held by the draw bar so it outlives the still view, handed over by frameEditStore). It reads the take's hero stills
// (every version of the first frame lives there, newest first — the edit route writes its new still beside the old ones) and sends
// the press as a scene job of the new frameEdit intent. Clicking a version is the existing approval path unchanged (approveHero,
// then stillChanged so Render reads it at once): draw and render refuse stale frames exactly as they always did. (owner 10-29) There
// is no Approve press any more: the selected version IS the frame in use, and a take with exactly one fresh version and none in use
// selects it by itself (once per version, through the same approval, so a refusal is said and never retried in a loop).
import { useCallback, useEffect, useRef, useState } from 'react'
import { JobDetached, JobRefused } from '../../jobs/sceneJobs'
import { useCurrentJobs, useJobRunning } from '../../jobs/useSceneJobs'
import { type HeroListResponse, type HeroStill, type TakeRecord } from '../../shared/shotContract'
import { staleWhy } from '../../shared/startKey'
import type {} from '../../shared/stillBible'
import { TAKE_WORDS_CHANGED } from '../../shared/takeWordsContract'
import { BIBLE_CHANGED } from '../scene/bibleApi'
import { useCurrentTakeId } from '../shoot/currentTake'
import { useAllTakes } from '../shoot/worldTakes'
import { followFrame } from '../shoot/firstFrameView'
import { approveHero, fetchHero, HeroApiError, heroChanged, onHeroChanged } from '../shoot/heroApi'
import { stillChanged } from '../render/l2rStore'
import { runningOf } from '../../jobs/scope'
import { FRAME_EDIT_CREDITS } from '../../../server/frameEdit/spec'
import { postFrameEdit } from './frameEditApi'
import { frameEditWarning } from './frameEditWarn'

const LIST_MS = 4000
const RUNNING_MS = 2500

export type FrameVersion = HeroStill & { stale: boolean; staleWhy?: string; editOf?: string; prompt?: string }

const short = (t: string, n = 28) => (t.length > n ? `${t.slice(0, n).trimEnd()}…` : t)
/** a version's name in plain words: "Draw 2", or "Edit 1 (remove the helmet…)" (counted oldest first, draws and edits apart) */
export function versionName(v: FrameVersion, versions: readonly FrameVersion[]): string {
  const edit = !!v.editOf
  const n = [...versions].reverse().filter((x) => !!x.editOf === edit).findIndex((x) => x.id === v.id) + 1
  return edit ? `Edit ${n || 1}${v.prompt ? ` (${short(v.prompt)})` : ''}` : `Draw ${n || 1}`
}

export interface FrameEditModel {
  takeId: string | null
  /** every version of the first frame, newest first; using one makes it the frame (the shared approval) */
  versions: FrameVersion[]
  /** the version in use: the approved one the render and the draws take, while it is not stale; null = none chosen yet */
  inUse: FrameVersion | null
  /** the version whose approval is out, or null */
  using: string | null
  /** the version the next edit starts from: the one just clicked, else the approved one, else the newest fresh one */
  base: FrameVersion | null
  /** the version the full-screen still view shows: the owner's click on a version, else null (the view shows the take's frame) */
  shown: FrameVersion | null
  onShow: (id: string) => void
  text: string
  onText: (t: string) => void
  /** the free local warning for this sentence (camera/zoom words, a re-pose), or null */
  warning: string | null
  /** why the press is off (the button's grey reason); null = it can be pressed */
  gate: string | null
  /** an edit or a draw of this take runs: the pill, not the press */
  running: boolean
  /** this take's edit runs (pressed here or still out from before): the "editing…" pill wherever the box is not on screen */
  editing: boolean
  phase: string | null
  error: string | null
  onPress: () => void
  /** one click on a version (owner 10-29): it shows full size, and a fresh one also becomes the frame in use (the existing approve
   *  press, through draw and render's own guard) and the base of the next edit. A stale one, or any click while an edit or an approval
   *  runs, only shows. Every reader of the take's stills (the right panel's Approve, the step cue) reads the approval again at once */
  onSelect: (id: string) => Promise<void>
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function useFrameEdit(): FrameEditModel {
  const takeId = useCurrentTakeId()
  const jobs = useCurrentJobs()
  const myJob = useJobRunning(jobs, 'frameEdit', takeId ?? undefined)
  // the take from the page's one shared takes poll (worldTakes.ts), not a full-list read per refresh (fix 2026-10-30)
  const allTakes = useAllTakes()
  const take: TakeRecord | null = (takeId && allTakes?.find((t) => t.id === takeId)) || null
  const [list, setList] = useState<HeroListResponse | null>(null)
  const [baseId, setBaseId] = useState<string | null>(null)
  const [shownId, setShownId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [using, setUsing] = useState<string | null>(null)
  const busy = useRef(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const refresh = useCallback(async (id: string) => {
    try {
      const l = await fetchHero(id)
      if (!alive.current) return
      setList({ ...l, running: runningOf(l.running, id) })
    } catch (e) { if (alive.current && !busy.current) setError(msg(e)) }
  }, [])

  useEffect(() => {
    if (!takeId) { setList(null); return }
    let stop = false
    const tick = () => { if (!stop) void refresh(takeId) }
    tick()
    const t = setInterval(tick, list?.running || myJob || phase ? RUNNING_MS : LIST_MS)
    return () => { stop = true; clearInterval(t) }
  }, [takeId, refresh, list?.running, myJob, phase])

  // the take's words (or the scene's, which a take without words of its own follows) were written: the server re-judges every
  // version at once, so the strip reads it at once rather than at the next tick
  useEffect(() => {
    if (!takeId) return
    const on = () => void refresh(takeId)
    window.addEventListener(TAKE_WORDS_CHANGED, on)
    window.addEventListener(BIBLE_CHANGED, on)
    const off = onHeroChanged(takeId, () => { setBaseId(null); on() }) // an approval anywhere: the strip marks the frame in use at once, and the next edit starts from it
    return () => { window.removeEventListener(TAKE_WORDS_CHANGED, on); window.removeEventListener(BIBLE_CHANGED, on); off() }
  }, [takeId, refresh])

  const versions: FrameVersion[] = (list?.stills ?? [])
    .filter((s) => (s.role ?? 'opening') === 'opening')
    .map((s) => {
      const why = take ? staleWhy(s, take) ?? s.bibleWhy ?? null : null
      return { ...s, stale: !!why, ...(why ? { staleWhy: why } : {}) }
    })
  const inUse = versions.find((s) => s.approved && !s.stale) ?? null
  const base = versions.find((s) => s.id === baseId && !s.stale) ?? inUse ?? versions.find((s) => !s.stale) ?? null // the click, else in use, else newest
  const shown = versions.find((s) => s.id === shownId) ?? null
  const serverRunning = !!list?.running
  const running = !!myJob || serverRunning || busy.current
  const editing = !!myJob || busy.current

  const warning = frameEditWarning(text)
  let gate: string | null = null
  if (!takeId) gate = 'Lock a take first.'
  else if (!versions.length) gate = 'Draw the first frame first: an edit starts from a drawn frame.'
  else if (!base) gate = 'That version is stale: draw the frame again.'
  else if (running) gate = myJob ? 'The edit is running.' : 'A draw of this take is running.'
  else if (!text.trim()) gate = 'Say the one change first.'

  const onPress = useCallback(() => {
    if (!takeId || !base || gate) return
    busy.current = true
    setError(null); setPhase('Editing the frame…')
    void (async () => {
      try {
        const out = await jobs.run({ intent: 'frameEdit', target: takeId, price: FRAME_EDIT_CREDITS }, () => postFrameEdit({ takeId, stillId: base.id, prompt: text.trim() }))
        await refresh(takeId)
        heroChanged(takeId) // the hero block lists the new version too
        if (alive.current && out?.still?.id) setShownId(out.still.id) // the result is what the still view shows next
      } catch (e) {
        if (alive.current && !(e instanceof JobDetached)) setError(e instanceof JobRefused ? e.message : msg(e))
      } finally {
        busy.current = false
        if (alive.current) setPhase(null)
      }
    })()
  }, [takeId, base, gate, text, jobs, refresh])

  const onPick = useCallback(async (id: string) => {
    if (!takeId) return
    setError(null); setUsing(id)
    try { await approveHero(takeId, id) } catch (e) { setBaseId(null); setError(e instanceof HeroApiError ? e.message : msg(e)) }
    await refresh(takeId)
    if (alive.current) setUsing(null)
    heroChanged(takeId) // the right panel's Approve and the step cue: before this they kept asking to approve a frame already in use
    await stillChanged() // Render reads the approval at once
  }, [takeId, refresh])

  const tried = useRef(new Set<string>())
  // (owner 10-29) a version that lands while the Stage is open (a draw or an edit) is the frame in use at once: shown full size, the
  // base of the next edit, and approved through the same free press a click makes (its stale guard included). The versions on the
  // first read of a take are only known, never picked; a stale newcomer is never picked. A click on another version still switches.
  const known = useRef<{ take: string; ids: Set<string> } | null>(null)
  const [landed, setLanded] = useState<string | null>(null)
  useEffect(() => {
    if (!takeId || !take || take.id !== takeId || !list) return
    if (known.current?.take !== takeId) { known.current = { take: takeId, ids: new Set(versions.map((v) => v.id)) }; return }
    const ids = known.current.ids
    const fresh = versions.filter((v) => !ids.has(v.id))
    fresh.forEach((v) => ids.add(v.id))
    const next = fresh.find((v) => !v.stale)
    if (next) setLanded(next.id)
  }, [takeId, take, list]) // eslint-disable-line react-hooks/exhaustive-deps -- `versions` is derived from take and list
  useEffect(() => {
    if (!landed || using !== null) return
    setLanded(null)
    tried.current.add(landed)
    setShownId(landed); setBaseId(landed); followFrame(landed)
    if (inUse?.id !== landed) void onPick(landed)
  }, [landed, using, inUse, onPick])

  // one fresh version and none in use: it is the frame (read only once the take is, so a stale one never looks fresh)
  const fresh = take ? versions.filter((s) => !s.stale) : []
  const lone = !inUse && fresh.length === 1 ? fresh[0].id : null
  useEffect(() => {
    if (!lone || running || using !== null || tried.current.has(lone)) return
    tried.current.add(lone)
    void onPick(lone)
  }, [lone, running, using, onPick])

  const onSelect = useCallback(async (id: string) => {
    setShownId(id)
    const v = versions.find((x) => x.id === id)
    if (!v || v.stale || running || using !== null) return // a stale or busy click only looks
    setBaseId(id)
    if (inUse?.id !== id) await onPick(id)
  }, [versions, running, using, inUse, onPick])
  return { takeId, versions, inUse, using, base, shown, onShow: setShownId, onSelect, text, onText: setText, warning, gate, running, editing, phase, error, onPress }
}

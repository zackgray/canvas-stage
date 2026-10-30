// The Scene screen's state: the kit world's Bible (bibleContract) over A1's routes. The prompt and the two lines are drafts on
// top of the saved Bible until Save; every write returns the Bible's next version, which replaces the one shown. One write at a
// time. Only drawMaster spends; it is guarded so it never starts twice, without a world, or while the server says one is running.
// The draw is a job of the scene (src/jobs): it keeps Draw the look disabled on every screen until it lands, and a draw that lands
// after leaving the Set step (or a reload) is shown when the step is back, as the draw's own response would have been (M1, M2).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BibleElement, BibleMasterRequest, BibleRecord, BibleResponse } from '../../shared/bibleContract'
import { JobDetached, JobRefused } from '../../jobs/sceneJobs'
import { sinceOf, useCurrentJobs, useJobConsumer, useJobRunning } from '../../jobs/useSceneJobs'
import { setApprovalState, type SetApproval } from '../../shared/setApproval'
import { bibleApi, bibleReply, type BibleApi } from './bibleApi'
import { insertTag, isTag, masterCredits, MASTER_SEEDS, textDirty } from './sceneTags'

type Text = { prompt: string; lighting: string; materials: string }
export type SceneBusy = 'load' | 'save' | 'master' | 'approve' | 'approveSet' | 'element' | 'recover' | null

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const DEFAULT_API = bibleApi()
/** how often a master draw started elsewhere (another tab, before a reload) is re-read */
export const RUNNING_POLL_MS = 4000
/** what Approve the set says when it lands; shown only while the set really is approved */
export const SET_APPROVED_NOTE = 'The set is approved.'

/** `prepare` runs (free) before a master draw: the set's master-view depth is measured there when the server has none */
export function useScene(worldId: string | null, api: BibleApi = DEFAULT_API, prepare?: () => Promise<void>) {
  const [bible, setBible] = useState<BibleRecord | null>(null)
  const [running, setRunning] = useState<BibleResponse['running']>(null)
  // (guided wave) the set the owner approved and the set's key now, as the server last said (GET and the approval's reply carry both)
  // a remount (the Set panel comes back when a pick is cleared) starts from the last answer for this world, never a blank "none"
  const [approval, setApproval] = useState<{ approval: SetApproval | null; key: string | null; keys?: string[] } | null>(() => (worldId ? lastApproval.get(worldId) ?? null : null))
  const [unrecovered, setUnrecovered] = useState<NonNullable<BibleResponse['unrecovered']>>([])
  const [edits, setEdits] = useState<Partial<Text>>({})
  const [busy, setBusy] = useState<SceneBusy>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const lock = useRef(false)
  /** when this page's own master draw began, so its progress clock runs before the server reports it */
  const [drawSince, setDrawSince] = useState<number | null>(null)

  const take = useCallback((r: BibleResponse) => {
    setBible(r.bible); setRunning(r.running ?? null)
    if (r.setApproval !== undefined) {
      const a = { approval: r.setApproval, key: r.setKey ?? null, keys: r.setKeys ?? [] }
      if (worldId) lastApproval.set(worldId, a)
      setApproval(a)
    }
    if (r.unrecovered !== undefined || r.running) setUnrecovered(r.unrecovered ?? [])
  }, [worldId])
  const jobs = useCurrentJobs()
  const drawing = useJobRunning(jobs, 'master')
  // a draw this step did not see land (it was away, or the page reloaded): its candidates, or its reason, shown here
  const owner = useJobConsumer(jobs, { intents: ['master'], parse: (_j, r) => bibleReply(r),
    apply: async (j, outcome) => {
      try { const r = await outcome as BibleResponse; if (j.target === worldId) { take(r); setNote('New master candidates: approve one.') } } catch (e) { setError(message(e)) }
    } }, !!worldId)

  const [loaded, setLoaded] = useState<string | null>(null)
  useEffect(() => { // the world's Bible (the screen remounts this hook per world, so nothing carries over)
    if (!worldId) return
    let live = true
    api.get(worldId).then((r) => { if (live) take(r) }, (e) => { if (live) setError(message(e)) }).finally(() => { if (live) setLoaded(worldId) })
    return () => { live = false }
  }, [worldId, api, take])

  useEffect(() => { // a draw in flight that this page did not start: re-read until it lands
    if (!worldId || !running || busy || loaded !== worldId) return
    const t = setInterval(() => { api.get(worldId).then(take, () => {}) }, RUNNING_POLL_MS)
    return () => clearInterval(t)
  }, [worldId, running, busy, loaded, api, take])

  const text: Text = useMemo(() => ({
    prompt: edits.prompt ?? bible?.prompt ?? '', lighting: edits.lighting ?? bible?.lighting ?? '', materials: edits.materials ?? bible?.materials ?? '',
  }), [edits, bible])
  const dirty = textDirty(bible, text)

  /** one write at a time; a refusal lands in `error` and changes nothing */
  const run = useCallback(async (what: Exclude<SceneBusy, null>, fn: () => Promise<string | null>) => {
    if (lock.current) return false
    lock.current = true; setBusy(what); setError(null); setNote(null)
    try { setNote(await fn()); return true } catch (e) { setError(message(e)); return false } finally { lock.current = false; setBusy(null) }
  }, [])

  const edit = useCallback((k: keyof Text, v: string) => setEdits((e) => ({ ...e, [k]: v })), [])

  const save = useCallback(() => run('save', async () => {
    if (!worldId) throw new Error('build the set first')
    take(await api.save({ worldId, ...text }))
    setEdits({})
    return 'Saved the scene.'
  }), [run, worldId, api, text, take])

  // `choice` (tidy wave): the master preview card's lock and edited prompt; absent = the server's recipe defaults
  const drawMaster = useCallback((count = MASTER_SEEDS, choice?: Pick<BibleMasterRequest, 'preset' | 'prompt'>) => run('master', async () => {
    if (!worldId) throw new Error('build the set first')
    if (running || jobs.running('master')) throw new Error('a master draw is already running')
    setDrawSince(Date.now())
    if (dirty) take(await api.save({ worldId, ...text })) // the draw reads the saved prompt and lines
    setEdits({})
    if (prepare) await prepare()
    try { take(await jobs.run({ intent: 'master', target: worldId, price: masterCredits(count), owner }, () => api.drawMaster({ worldId, count, ...choice }))) } catch (e) {
      if (e instanceof JobDetached) return null
      throw e instanceof JobRefused ? new Error(e.message) : e
    }
    return 'New master candidates: approve one.'
  }), [run, worldId, running, dirty, api, text, take, prepare, jobs, owner])

  const approve = useCallback((masterId: string) => run('approve', async () => {
    if (!worldId) throw new Error('build the set first')
    if (!bible?.candidates.some((m) => m.id === masterId)) throw new Error('approve one of the drawn candidates')
    take(await api.approve({ worldId, masterId }))
    return 'Master approved.'
  }), [run, worldId, bible, api, take])

  /** (guided wave) free: approve the set as it stands; the Look phase opens on it */
  const approveSet = useCallback((setKey?: string) => run('approveSet', async () => {
    if (!worldId) throw new Error('build the set first')
    take(await api.approveSet(worldId, setKey))
    return SET_APPROVED_NOTE
  }), [run, worldId, api, take])

  /** read the world's Bible and set key again (a piece moved: the approval may be stale now) */
  const reload = useCallback(async () => { if (!worldId) return; try { take(await api.get(worldId)) } catch { /* the next read shows it */ } }, [worldId, api, take])

  /** Adds (or, with `replace`, edits) a reference tile; a new tile's tag is inserted into the prompt and saved with it. */
  const putElement = useCallback((el: BibleElement, replace = false) => run('element', async () => {
    if (!worldId) throw new Error('build the set first')
    if (!isTag(el.tag)) throw new Error(`"@${el.tag}" is not a tag: a lower-case word starting with a letter`)
    if (!replace && bible?.elements.some((e) => e.tag === el.tag)) throw new Error(`@${el.tag} is already a reference`)
    take(await api.putElement({ worldId, element: el }))
    if (replace) return `Updated @${el.tag}.`
    take(await api.save({ worldId, ...text, prompt: insertTag(text.prompt, el.tag) }))
    setEdits({})
    return `Added @${el.tag} to the prompt.`
  }), [run, worldId, bible, api, text, take])

  const removeElement = useCallback((tag: string) => run('element', async () => {
    if (!worldId) throw new Error('build the set first')
    take(await api.removeElement({ worldId, tag }))
    return `Removed @${tag}. The prompt still names it: stills and renders are refused until you take @${tag} out of it.`
  }), [run, worldId, api, take])

  /** M5: a billed master job whose candidates never landed (a restart mid-draw): fetched by id, free, then shown */
  const recover = useCallback((jobId: string) => run('recover', async () => {
    if (!worldId) throw new Error('build the set first')
    await api.recover(jobId)
    const r = await api.get(worldId)
    take(r); setUnrecovered(r.unrecovered ?? [])
    return 'Recovered the paid master candidates: approve one.'
  }), [run, worldId, api, take])

  const mention = useCallback((tag: string) => edit('prompt', insertTag(text.prompt, tag)), [edit, text.prompt])

  const shownBusy: SceneBusy = busy ?? (drawing ? 'master' : null) ?? (worldId && loaded !== worldId ? 'load' : null)
  const setState = setApprovalState(approval?.approval, approval?.key ?? null)
  /** the approval is known: read from the server for this world (or remembered from this page's last read); until then nothing is said */
  const setKnown = !!approval || (!!worldId && loaded === worldId)
  // the approval's own note is true only while the set is approved: an edit after it (stale) takes it away at once
  const shownNote = note === SET_APPROVED_NOTE && setState !== 'approved' ? null : note
  return { worldId, ready: !!worldId && loaded === worldId, drawSince: drawSince ?? sinceOf(drawing), bible, running, unrecovered, text, dirty, busy: shownBusy, error, note: shownNote, setState, setKnown, approvedKeys: approval?.keys ?? [], approveSet, reload, edit, save, drawMaster, approve, putElement, removeElement, mention, recover }
}

export type SceneState = ReturnType<typeof useScene>

/** the set's approval as this page last read it, per world: a remounted panel shows it at once while it reads it again */
const lastApproval = new Map<string, { approval: SetApproval | null; key: string | null; keys?: string[] }>()

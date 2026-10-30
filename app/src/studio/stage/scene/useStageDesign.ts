// The Stage's one copy of the scene design, as hooks (StageScene.tsx publishes it). One useDesign for the scene (its draft, saved
// after each change settles, with its revision), the design calls (the paid cast draws as jobs of the scene, and their job
// consumer, which applies an answer that lands after a reload), the sheet sync (useV2Save) and the counted sheet writes.
// Rules kept from the words drawer's own copy: nothing is written until a change is made through this copy's setters (opening
// the Stage never writes the draft, and arriving from the Board never races the Board's own last write); every setter counts,
// a paid answer landing included; a chip opens nothing here; and the sheet's writes are counted, so Redraw waits for them.
import { useCallback, useMemo, useRef, useState, type RefObject } from 'react'
import { jobFetch, sceneJobs, type SceneJobs } from '../../../jobs/sceneJobs'
import { getKitWorld, saveKitPerformance } from '../../../labs/projection/stage3d/kitApi'
import { bibleApi, type BibleApi } from '../../scene/bibleApi'
import { briefApi, type BriefApi } from '../../scene/briefApi'
import { useCastCards } from '../../scene/castCards'
import { useDesign, type DesignState, type LibItem } from '../../scene/design/useDesign'
import { useDesignCalls } from '../../scene/design/useDesignCalls'
import { useV2Save } from '../../scene/design/useV2Save'
import type { SceneCtx } from '../../scene/sceneCtx'

/** the world's performance routes the person maker writes through (tests fake them) */
export interface KitIo { get: typeof getKitWorld; savePerf: typeof saveKitPerformance }
export interface StageSceneDeps { api?: BriefApi; bible?: BibleApi; jobs?: SceneJobs; kit?: KitIo }
const DEFAULT_BIBLE = bibleApi()
const DEFAULT_KIT: KitIo = { get: getKitWorld, savePerf: saveKitPerformance }
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** the draft io that writes only once a change was made through this copy (the design's own save after its first read is skipped) */
const quietIo = (api: BriefApi, edited: RefObject<boolean>): Pick<BriefApi, 'loadDraft' | 'saveDraft'> => ({
  loadDraft: () => api.loadDraft(),
  saveDraft: (d, o) => (edited.current ? api.saveDraft(d, o) : Promise.resolve()),
})

/** the project's saved cast cards as the @ menu offers them (the project's card library) */
const libOf = (cards: ReturnType<typeof useCastCards>['cards']): LibItem[] => cards.map((k) => ({
  tag: k.id.replace(/[^a-z0-9_-]/g, '-').replace(/^[^a-z]+/, '') || 'cast', name: k.name, type: 'person',
  look: k.versions.at(-1)?.payload.references[0] ?? k.versions.at(-1)?.payload.sheets[0] ?? null, cardId: k.id,
}))

/** the design's setters that change it: each one marks the copy as changed before it runs */
const SETTERS = ['set', 'adopt', 'editBrief', 'addPiece', 'patchPiece', 'removePiece', 'retag', 'closePiece', 'approve', 'approveAll', 'togglePanel'] as const

/** every setter wrapped so that a call counts as a change (the identities stay as stable as the design's own) */
function useCounted(design: DesignState, edited: RefObject<boolean>): DesignState {
  const fns = SETTERS.map((k) => design[k])
  const wrapped = useMemo(() => Object.fromEntries(SETTERS.map((k, i) => {
    const f = fns[i] as (...a: unknown[]) => unknown
    return [k, (...a: unknown[]) => { edited.current = true; return f(...a) }]
  })), fns) // eslint-disable-line react-hooks/exhaustive-deps
  const { say, ref } = design
  // a chip opens nothing here: the piece dialogs belong to the Board
  const openPiece = useCallback((id: string) => {
    const p = ref.current.pieces.find((q) => q.id === id)
    say(p ? `@${p.tag}'s look was changed on the Stage.` : null)
  }, [ref, say])
  return { ...design, ...(wrapped as Partial<DesignState>), openPiece }
}

export interface StageSceneState {
  scene: string
  worldId: string | null
  /** the design, its calls, its Bible routes (the sheet's writes counted) and the cast library, as every Scene part reads them */
  x: SceneCtx
  /** the edited words are not on the scene sheet yet (a draw now would read the old ones) */
  saving: boolean
  /** the world's performance routes */
  kit: KitIo
}

export function useStageDesign(scene: string, worldId: string | null, deps?: StageSceneDeps): StageSceneState {
  const cast = useCastCards()
  const lib = useMemo(() => libOf(cast.cards), [cast.cards])
  const api = useMemo(() => deps?.api ?? briefApi(jobFetch, scene), [deps?.api, scene])
  const edited = useRef(false)
  const io = useMemo(() => quietIo(api, edited), [api])
  const s = useCounted(useDesign(lib, io, scene), edited)
  const jobs = deps?.jobs ?? sceneJobs(scene)
  const calls = useDesignCalls(s, api, jobs)
  const { say } = s
  // a dropped image's failure is said under the words, where it was dropped
  const upload = useCallback(async (f: File): Promise<string | null> => {
    try { return await api.uploadReference(f) } catch (e) { say(`The image was not added: ${message(e)}`); return null }
  }, [api, say])
  // the sheet's writes in flight, counted, so Redraw waits until the words it would draw from are there
  const [pending, setPending] = useState(0)
  const base = deps?.bible ?? DEFAULT_BIBLE
  const bible = useMemo<BibleApi>(() => ({
    ...base,
    save: (req, o) => {
      setPending((n) => n + 1)
      return (o ? base.save(req, o) : base.save(req)).finally(() => setPending((n) => n - 1))
    },
  }), [base])
  // a placeholder Build the set: the provider (StageScene.tsx) puts the scene's real one (useStageBuild.ts) over it
  const x: SceneCtx = { s, lib, api, worldId, bible, c: { ...calls, upload }, set: { build: async () => null, phase: null, error: null, building: false } }
  useV2Save(x)
  return { scene, worldId, x, saving: pending > 0 || !!s.d.v2Stale, kit: deps?.kit ?? DEFAULT_KIT }
}

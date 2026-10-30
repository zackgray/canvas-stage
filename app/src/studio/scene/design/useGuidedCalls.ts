// Guided's own calls: its state's setters and the paid draws of its pieces (a cast card's fronts, a prop's tiles). Every paid one
// runs through useDesignCalls' `paid` (one job of the scene, applied by its target in applyCalls.ts). The word stages draw nothing,
// so there is no stage Generate.
import { useCallback } from 'react'
import type { JobIntent } from '../../../shared/libraryContract'
import type { SceneJobs } from '../../../jobs/sceneJobs'
import type { BriefApi, GuidedStageId, PieceType } from '../briefApi'
import { genCount, type CastCard, type Guided, type PropCard } from './guided'
import { candidateCredits } from './model'
import { beatPersons, storyBeats } from './storyBeats'
import type { DesignState } from './useDesign'

type Paid = (intent: JobIntent, target: string, credits: number, call: () => Promise<unknown>) => Promise<unknown>
const drawIntent = (t: PieceType): JobIntent => (t === 'person' || t === 'creature' ? 'cast' : 'concept')

export function useGuidedCalls(s: Pick<DesignState, 'ref' | 'set'>, api: BriefApi, jobs: SceneJobs, paid: Paid) {
  const { set } = s
  const setG = useCallback((f: (g: Guided) => Guided) => set((y) => (y.guided ? { guided: f(y.guided) } : {})), [set])
  const patchStage = useCallback((id: GuidedStageId, p: Partial<Guided['st'][GuidedStageId]>) => {
    setG((g) => ({ ...g, st: { ...g.st, [id]: { ...g.st[id], ...p } } }))
    // a story edit after the set is built re-derives the sheet's beats from the new words, so a re-render reads them
    if (id !== 'story' || typeof p.text !== 'string') return
    const d = s.ref.current
    if (!d.v2) return
    const beats = storyBeats(p.text, beatPersons(d.pieces, d.v2))
    set((y) => (y.v2 ? { v2: beats.length ? { ...y.v2, beats } : y.v2, v2Stale: true } : {}))
  }, [setG, s.ref, set])
  const patchCard = useCallback((cid: string, p: Partial<CastCard> | ((c: CastCard) => Partial<CastCard>)) =>
    setG((g) => ({ ...g, cast: g.cast.map((c) => (c.id === cid ? { ...c, ...(typeof p === 'function' ? p(c) : p) } : c)) })), [setG])
  const patchProp = useCallback((pid: string, p: Partial<PropCard> | ((c: PropCard) => Partial<PropCard>)) =>
    setG((g) => ({ ...g, props: (g.props ?? []).map((c) => (c.id === pid ? { ...c, ...(typeof p === 'function' ? p(c) : p) } : c)) })), [setG])

  /** a cast card's options (a group's extras sheets), drawn from its own words only: a piece carries no scene light or materials;
   *  the person maker's edited rules and picture words ride along (unedited, the request is as it always was) */
  const genCast = useCallback((cid: string) => {
    const g = s.ref.current.guided
    const c = g?.cast.find((y) => y.id === cid)
    if (!c || jobs.running(drawIntent(c.type), `cast:${cid}`)) return
    const n = genCount(g, 'cast')
    // the press fixes how many options this run draws; the stepper only sets the next press (asked rides the card while busy)
    patchCard(cid, { busy: true, asked: n })
    void paid(drawIntent(c.type), `cast:${cid}`, candidateCredits(c.type, n, s.ref.current.quality),
      () => api.candidates({ type: c.type, prompt: c.desc || c.name, count: n, name: c.name, quality: s.ref.current.quality,
        ...(c.rules !== undefined ? { rules: c.rules } : {}), ...(c.framing !== undefined ? { framing: c.framing } : {}) }))
  }, [s.ref, jobs, paid, api, patchCard])

  /** a prop's tiles, drawn from its own words only: no scene light, no scene materials (the hat-on-the-hive failure) */
  const genProp = useCallback((pid: string) => {
    const g = s.ref.current.guided
    const p = g?.props?.find((y) => y.id === pid)
    if (!p || !p.name.trim() || jobs.running('concept', `prop:${pid}`)) return
    const n = genCount(g, 'props')
    patchProp(pid, { busy: true, asked: n })
    void paid('concept', `prop:${pid}`, candidateCredits('prop', n, s.ref.current.quality),
      () => api.candidates({ type: 'prop', prompt: p.desc.trim() || p.name.trim(), count: n, name: p.name.trim(), lighting: '', materials: '', quality: s.ref.current.quality }))
  }, [s.ref, jobs, paid, api, patchProp])

  return { setG, patchStage, patchCard, patchProp, genCast, genProp }
}

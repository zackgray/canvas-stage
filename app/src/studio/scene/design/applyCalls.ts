// What a finished paid design call does to the design, by the job's target ("tile:p3", "cast:c1", "prop:r2" …). One place, used
// by the press that is still on screen and by a result that lands after leaving Scene or a reload (M1, src/jobs): either way the
// design changes exactly as the original response would have changed it.
import { PlannerError, type CandidatesResponse, type GuidedStageId } from '../briefApi'
import type { DevelopResponse } from '../../../shared/bibleContract'
import { developedGuided, developedWords } from './developGuided'
import { keepMade } from './developKeep'
import { isCastFront } from './model'
import type { CastCard, Guided, PropCard } from './guided'
import type { Design } from './state'
import type { DesignState } from './useDesign'

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
/** new URLs after the ones already there, each once (a pick or a look index into the old ones stays on its image) */
const append = (old: readonly string[], add: readonly string[]) => [...new Set([...old, ...add])]
/** a failed draw on a tile: its reason, and the job to recover when it was billed (m3) */
export const failure = (e: unknown) => ({ loading: false, problem: message(e), ...(e instanceof PlannerError && e.jobId && e.runId ? { recover: { jobId: e.jobId, runId: e.runId } } : {}) })

export interface ApplyCtx {
  s: Pick<DesignState, 'set' | 'patchPiece' | 'ref'>
  setError: (m: string | null) => void
}

const setG = (x: ApplyCtx, f: (g: Guided) => Guided) => x.s.set((d) => (d.guided ? { guided: f(d.guided) } : {}))
const patchStage = (x: ApplyCtx, id: GuidedStageId, p: Partial<Guided['st'][GuidedStageId]>) =>
  setG(x, (g) => ({ ...g, st: { ...g.st, [id]: { ...g.st[id], ...p } } }))
const patchCard = (x: ApplyCtx, cid: string, p: Partial<CastCard> | ((c: CastCard) => Partial<CastCard>)) =>
  setG(x, (g) => ({ ...g, cast: g.cast.map((c) => (c.id === cid ? { ...c, ...(typeof p === 'function' ? p(c) : p) } : c)) }))

const patchProp = (x: ApplyCtx, pid: string, p: (c: PropCard) => Partial<PropCard>) =>
  setG(x, (g) => ({ ...g, props: (g.props ?? []).map((c) => (c.id === pid ? { ...c, ...p(c) } : c)) }))

const split = (target: string): [string, string] => { const i = target.indexOf(':'); return i < 0 ? [target, ''] : [target.slice(0, i), target.slice(i + 1)] }

/** the call's answer on the design; throws (and is then a failure) when the answer is not usable */
export function applyOk(x: ApplyCtx, target: string, r: unknown): void {
  const [kind, id] = split(target)
  const d: Design = x.s.ref.current
  if (kind === 'tile') {
    // a person or creature draw is one job whose server minimum is a pair: the tile keeps one picture, never both fronts
    const p = d.pieces.find((q) => q.id === id)
    const urls = (r as CandidatesResponse).urls
    const kept = p && isCastFront(p.type) ? urls.slice(0, 1) : urls
    x.s.patchPiece(id, { looks: kept, look: 0, loading: false })
  } else if (kind === 'piece') {
    const urls = (r as CandidatesResponse).urls
    x.s.set((y) => ({ pieces: y.pieces.map((q) => {
      if (q.id !== id) return q
      // a new pair for a person or creature replaces the old picture: one approved image per person, never a strip of fronts
      if (isCastFront(q.type)) return { ...q, looks: urls.slice(0, 1), look: 0, state: 'draft', loading: false }
      const all = append(q.looks, urls)
      return { ...q, looks: all, look: Math.max(0, all.indexOf(urls[0])), state: 'draft', loading: false }
    }) }))
  } else if (kind === 'stage') {
    const urls = (r as CandidatesResponse).urls
    setG(x, (g) => ({ ...g, st: { ...g.st, [id]: { ...g.st[id as GuidedStageId], cands: append(g.st[id as GuidedStageId].cands, urls), busy: false } } }))
  } else if (kind === 'cast') {
    patchCard(x, id, (c) => ({ cands: append(c.cands, (r as CandidatesResponse).urls), busy: false }))
  } else if (kind === 'prop') {
    patchProp(x, id, (c) => ({ cands: append(c.cands, (r as CandidatesResponse).urls), busy: false }))
  } else if (kind === 'develop') {
    // the front door: the answer fills the Guided cards (developGuided.ts) and becomes the scene words the drawer shows (composed,
    // so not a hand edit); its own v2 brief is kept whole (the people's tags and the beats), for the sheet to get once a world
    // exists; a person or prop already made on the Stage is kept in both (developKeep.ts). An answer with no brief is a failure:
    // nothing is changed
    const brief = (r as DevelopResponse | null)?.brief
    if (!brief) throw new Error('Develop came back without a scene brief. Nothing was changed.')
    x.s.set((y) => {
      if (!y.guided) return {}
      const guided = developedGuided(y.guided, brief)
      const kept = keepMade(y.pieces, developedWords(guided), brief.v2)
      return { guided, brief: kept.words, edited: false, ...(kept.v2 ? { v2: kept.v2 } : {}), v2Stale: true }
    })
  }
}

/** a refusal or failure: the tile, stage or card stops waiting and the reason is said (a board tile keeps its own) */
export function applyFail(x: ApplyCtx, target: string, e: unknown): void {
  const [kind, id] = split(target)
  if (kind === 'tile' || kind === 'piece') x.s.patchPiece(id, failure(e))
  else if (kind === 'stage') patchStage(x, id as GuidedStageId, { busy: false })
  else if (kind === 'cast') patchCard(x, id, { busy: false })
  else if (kind === 'prop') patchProp(x, id, () => ({ busy: false }))
  if (kind !== 'tile') x.setError(message(e))
}

/** the result as the press would have taken it */
export function settle(x: ApplyCtx, target: string, outcome: Promise<unknown>): Promise<boolean> {
  return outcome.then((r) => { try { applyOk(x, target, r); return true } catch (e) { applyFail(x, target, e); return false } }, (e: unknown) => { applyFail(x, target, e); return false })
}

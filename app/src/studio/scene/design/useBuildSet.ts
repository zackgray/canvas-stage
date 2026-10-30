// "Build the set →": the approved design becomes a kit world (mounted once per scene page, by the Stage's provider, StageScene.tsx:
// the design as it stands, its tiles kept, its Guided props planned as stand-ins). Everything free comes first and refuses before any spend (wave 3 M1):
// the reasons on the button (buildBlock), a Cast card saved for every person and creature tile that has none, and the server's
// check of the whole Bible this design would write. Then the planner turns the place sentences into a kit plan (paid, one Gemma
// job; planSentence keeps it inside the planner's limit, M2), parsePlan checks it, and the existing kit build writes the world.
// Right after the world is written and before the lab lands on it: the draft's files are copied into the world's Bible folder
// (nothing removed), then the Bible is written. A failure at any step leaves the draft as it was.
// The plan is a job of the scene (src/jobs): Build stays disabled on every screen while it runs, and a plan that lands after leaving
// Scene carries on with the free kit build exactly as the press would have (M1), then opens the set (`onBuilt`). A plan this page
// did not press (a reload, a closed tab, another tab) builds the set (free) and does not open it: `onBuilt` is not called, only
// `onBuiltAway` (the Stage approves the set with it, free; review F3). Neither ever
// draws the master: Build the set is the planner only, and the look waits for its own priced press on the approved set.
// The world is written for the scene (useKitBuild sends its id), so a rebuild adds a world to the scene and old takes stay reachable.
import { useCallback, useMemo, useRef, useState } from 'react'
import { JobDetached, JobRefused, sceneJobs, type SceneJobs } from '../../../jobs/sceneJobs'
import { sinceOf, useJobConsumer, useJobRunning } from '../../../jobs/useSceneJobs'
import type { PlanResponse } from '../../../shared/bibleContract'
import { createKitWorld, uploadKitMasterDepth, uploadKitStill } from '../../../labs/projection/stage3d/kitApi'
import { renderKitMasterDepth, renderKitStill } from '../../../labs/projection/stage3d/kitStill'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { plannerCredits, retryCost } from '../../../shared/bibleContract'
import type { ScenePlan } from '../../../stage3d/contract'
import { parsePlan } from '../../../stage3d/plan'
import { DEFAULT_SKY } from '../../../stage3d/planRules'
import { useKitBuild, type KitBuildDeps } from '../../kit/useKitBuild'
import { bibleApi, type BibleApi } from '../bibleApi'
import { failedSpend, type BriefApi } from '../briefApi'
import { bibleWrite, buildBlock, planProps, planSentence, PLAN_SENTENCE, tagNames } from './buildCheck'
import { shownOnBoard, type Piece } from './model'
import { remapDesign, type Design } from './state'

export { elementOfPiece } from './buildCheck'

/** a world with the default procedural sky, flat ground and nothing placed (passes parsePlan); a new scene starts on it */
export const EMPTY_PLAN: ScenePlan = { seed: 1, ground: 'flat', sky: { url: DEFAULT_SKY }, kit: [] }

const DEFAULT_BIBLE = bibleApi()
/** the kit build's own steps (useKitBuild's defaults), so the Bible write can sit between writing the world and landing on it */
const KIT_DEFAULTS: KitBuildDeps = { create: createKitWorld, still: renderKitStill, upload: uploadKitStill, depth: renderKitMasterDepth, uploadDepth: uploadKitMasterDepth }

export interface BuildSetDeps {
  kit?: KitBuildDeps; bible?: BibleApi; onMoved?: (moved: Record<string, string>) => void
  /** saves the Cast cards the board's people and creatures still need (free); the pieces with their card ids */
  cards?: (pieces: readonly Piece[]) => Promise<Piece[]>
  /** the scene's job store, a set built from a plan that landed after the press's screen was gone, and whether the design is loaded */
  jobs?: SceneJobs; onBuilt?: (worldId: string) => void; ready?: boolean
  /** a set built from a plan this page did not press (a reload mid-plan): the Stage approves it (free) here, so BUILT_AWAY's
   *  "approved" holds and Draw does not refuse with "Approve the set first" (review F3) */
  onBuiltAway?: (worldId: string) => void
}
const NO_JOBS = sceneJobs(null)
/** the scene job stores whose plan this page pressed and has not landed yet: a reload starts with none */
const pressed = new WeakSet<SceneJobs>()
export const BUILT_AWAY = 'The set was built from the plan that finished while you were away. It is approved and ready on the Stage.'

export function useBuildSet(lab: Pick<ProjectionLabState, 'refreshShots' | 'set'>, api: BriefApi, design: () => Design,
  spend: (n: number, retry?: number) => void, deps?: BuildSetDeps) {
  const bible = deps?.bible ?? DEFAULT_BIBLE
  const [phase, setPhase] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [since, setSince] = useState<number | null>(null)
  const busy = useRef(false)
  /** the design this build checked (with its card ids), so the world gets exactly that */
  const checked = useRef<Design | null>(null)

  const base = deps?.kit ?? KIT_DEFAULTS
  // an empty set (the scene's starting world) has no words to write into a Bible yet: the drawer's sheet sync writes it with the first words
  const empty = useRef(false)
  const kitDeps = useMemo((): KitBuildDeps => ({
    ...base, create: async (req) => {
      const d = checked.current ?? design()
      const w = await base.create(req)
      if (!empty.current) await writeBible(bible, w.id, await moveDraft(api, w.id, d, deps?.onMoved))
      return w
    },
  }), [base, bible, design, api, deps?.onMoved])
  const kit = useKitBuild(lab, kitDeps)
  const cards = deps?.cards
  const jobs = deps?.jobs ?? NO_JOBS
  const planning = useJobRunning(jobs, 'plan')

  /** the rest of the build once the plan is in (free): the check, then the kit world, its Bible and the landing */
  const fromPlan = useCallback(async (r: PlanResponse, prompt?: string) => {
    const scene = r.scenes?.[0]
    const plan = scene?.plan ? parsePlan(scene.plan) : { ok: false as const, errors: scene?.errors?.length ? scene.errors : (r.errors ?? ['no plan came back']) }
    if (!plan.ok) throw new Error(`the planner's set did not pass the check: ${plan.errors.join('; ')}`)
    setPhase(null)
    return kit.build(plan.plan, prompt)
  }, [kit])
  const onBuilt = deps?.onBuilt, onBuiltAway = deps?.onBuiltAway
  const consumer = useRef({ fromPlan, design, onBuilt, onBuiltAway, spend })
  consumer.current = { fromPlan, design, onBuilt, onBuiltAway, spend }
  const owner = useJobConsumer(jobs, {
    intents: ['plan'], parse: api.parse,
    apply: async (_j, outcome) => {
      if (busy.current) return
      busy.current = true; setError(null)
      try {
        const plan = await outcome as PlanResponse
        if (_j.price) consumer.current.spend(_j.price, retryCost(plan, _j.price))
        // the press on this page opens the set it built; a plan landing on a page that did not press it only builds
        const live = pressed.has(jobs)
        pressed.delete(jobs)
        const id = await consumer.current.fromPlan(plan, bibleWrite(consumer.current.design()).prompt)
        if (id && live) consumer.current.onBuilt?.(id)
        else if (id) { setError(BUILT_AWAY); consumer.current.onBuiltAway?.(id) }
      } catch (e) {
        const lost = failedSpend(e); if (lost) consumer.current.spend(lost) // a 422 billed both planner tries
        setError(e instanceof Error ? e.message : String(e))
      } finally { busy.current = false; setPhase(null) }
    },
  }, deps?.ready ?? true)

  /** `over`: the design to build when the caller has just changed it (its state lands on the next render); else the current one */
  const build = useCallback(async (over?: Design) => {
    if (busy.current || jobs.running('plan')) return null
    busy.current = true; setError(null); setSince(Date.now())
    try {
      let d = over ?? design()
      const blocked = buildBlock(d, d.pieces.filter((p) => p.onBoard && shownOnBoard(p)))
      if (blocked) throw new Error(blocked)
      if (cards) { setPhase('Saving the cast cards…'); d = { ...d, pieces: await cards(d.pieces) } }
      setPhase('Checking the design…')
      const write = bibleWrite(d)
      const c = await bible.check(write)
      if (!c.ok) throw new Error(`the set was not built (nothing spent): ${c.errors.join('; ')}`)
      // the planner places a stand-in for every prop tile and every prop the words name that has no look yet
      const sentence = planSentence(d.brief, d.pieces, PLAN_SENTENCE, planProps(d), tagNames(d))
      setPhase('Planning the set…')
      checked.current = d
      pressed.add(jobs)
      // the brief's key light lights the set (the planner replaces its own recipe with it; planBriefLight.ts)
      const light = write.brief?.light
      const r = await jobs.run({ intent: 'plan', target: 'build', price: plannerCredits(1), owner }, () => api.plan({ prompts: [sentence], ...(light ? { light } : {}) }))
      pressed.delete(jobs)
      spend(plannerCredits(1), retryCost(r, plannerCredits(1))) // m1: counted once the plan is in (its retry too), never for a refused or failed one
      return await fromPlan(r, write.prompt)
    } catch (e) {
      if (!(e instanceof JobDetached)) pressed.delete(jobs) // a detached plan is still this page's press: its landing carries on
      const lost = failedSpend(e); if (lost) spend(lost) // a 422 (the answer failed the check twice) billed both tries: counted
      if (!(e instanceof JobDetached) && !(e instanceof JobRefused)) setError(e instanceof Error ? e.message : String(e))
      return null
    } finally { busy.current = false; checked.current = null; setPhase(null); setSince(null) }
  }, [design, spend, api, bible, cards, jobs, owner, fromPlan])

  /** the scene's starting world: the default sky and ground, nothing placed; free, no planner (null when a build is already under way) */
  const buildEmpty = useCallback(async () => {
    if (busy.current || jobs.running('plan')) return null
    busy.current = true; empty.current = true; setError(null)
    try { return await kit.build(EMPTY_PLAN) } finally { busy.current = false; empty.current = false }
  }, [kit, jobs])

  const shown = phase ?? kit.phase ?? (planning ? 'Planning the set…' : null)
  return { build, buildEmpty, phase: shown, error: error ?? (kit.errors.length ? kit.errors.join('; ') : null), building: !!shown, since: since ?? sinceOf(planning) }
}

/**
 * The draft (flushed first, so the newest design is the one copied) into the world's Bible folder; the design with its URLs on
 * the copies. Nothing is removed. A failed copy leaves the files where they were: their draft URLs still serve.
 */
export async function moveDraft(api: Pick<BriefApi, 'saveDraft' | 'migrateDraft'>, worldId: string, d: Design, onMoved?: (moved: Record<string, string>) => void): Promise<Design> {
  try {
    await api.saveDraft(d as unknown as Record<string, unknown>)
    const moved = await api.migrateDraft(worldId)
    onMoved?.(moved)
    return remapDesign(d, moved)
  } catch { return d }
}

/** the design into the new world's Bible: the prompt and lines, the extras sheet, then every element; refused ones are named */
export async function writeBible(api: BibleApi, worldId: string, d: Design) {
  const { elements, ...save } = bibleWrite(d)
  await api.save({ worldId, ...save })
  const refused: string[] = []
  for (const element of elements) {
    try { await api.putElement({ worldId, element }) } catch (e) { refused.push(`@${element.tag}: ${e instanceof Error ? e.message : String(e)}`) }
  }
  if (refused.length) throw new Error(`the set was built, but the scene sheet refused ${refused.join('; ')}`)
}

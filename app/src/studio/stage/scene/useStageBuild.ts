// Build the set on the Stage (stage-only plan, section 1), mounted once per scene page with the Stage's one design copy
// (StageScene.tsx), so a plan that lands while the owner is on Render still builds. The design is built as it stands: its words,
// its tiles (people and props made on the Stage kept, never replaced by Guided picks), its Guided props as planner stand-ins
// (buildCheck.ts planProps, buildDesign). Once the world is written its set is approved (free) and the scene read again, so the
// Stage leaves its setup mode by itself.
import { useCallback, useEffect } from 'react'
import { sceneJobs, type SceneJobs } from '../../../jobs/sceneJobs'
import { refreshScene, useCurrentScene } from '../../../library/currentScene'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import type { KitBuildDeps } from '../../kit/useKitBuild'
import { buildDesign } from '../../scene/design/buildCheck'
import { remapDesign, type Design } from '../../scene/design/state'
import { useBuildSet } from '../../scene/design/useBuildSet'
import type { SetBuild } from '../../scene/sceneCtx'
import type { StageSceneState } from './useStageDesign'

export interface StageBuildDeps { jobs?: SceneJobs; buildKit?: KitBuildDeps }

export function useStageBuild(v: StageSceneState, lab: Pick<ProjectionLabState, 'refreshShots' | 'set'>, deps?: StageBuildDeps): SetBuild {
  const { s, c, api, bible } = v.x
  const { set, ref, synced } = s
  const { noteRetry, cards } = c
  const jobs = deps?.jobs ?? sceneJobs(v.scene)
  const design = useCallback(() => buildDesign(ref.current), [ref])
  const spend = useCallback((n: number, retry = 0) => { set((x) => ({ spent: x.spent + n + retry })); if (retry) noteRetry(retry) }, [set, noteRetry])
  // the draft's files moved into the new world's Bible: the live design follows them
  const onMoved = useCallback((moved: Record<string, string>) => set((x) => { const r = remapDesign(x, moved); return { pieces: r.pieces, guided: r.guided } }), [set])
  const approve = useCallback(async (id: string) => {
    try { await bible?.approveSet(id) } catch { /* the Set panel offers Approve the set */ }
    await refreshScene()
  }, [bible])
  const landed = useCallback((id: string) => { void approve(id) }, [approve])
  // a plan that lands after a reload builds the set here too: it is approved the same way (free; review F3), so Draw does not refuse
  const b = useBuildSet(lab, api, design, spend, { kit: deps?.buildKit, bible, onMoved, cards, jobs, onBuilt: landed, onBuiltAway: landed, ready: synced })
  const { build: run } = b
  const build = useCallback(async (d?: Design) => {
    const id = await run(d ? buildDesign(d) : undefined)
    if (id) await approve(id)
    return id
  }, [run, approve])

  // a scene with no world gets its starting world, empty (free, no planner): the Stage is the normal Stage from the first second
  const view = useCurrentScene().view
  const { buildEmpty } = b
  const startEmpty = useCallback(async () => {
    const id = await buildEmpty()
    if (id) await approve(id)
    else startedEmpty.delete(v.scene) // refused or failed: pressing Try again (or a reopen) starts it again
    return id
  }, [buildEmpty, approve, v.scene])
  const bare = !!view && view.id === v.scene && !view.worldId && view.worlds.length === 0
  useEffect(() => {
    if (!synced || !bare || startedEmpty.has(v.scene)) return
    startedEmpty.add(v.scene)
    void startEmpty()
  }, [synced, bare, startEmpty, v.scene])

  return { ...b, build, startEmpty }
}

/** the scenes whose starting world this page already began (a remount or a second arrival never starts a second) */
const startedEmpty = new Set<string>()

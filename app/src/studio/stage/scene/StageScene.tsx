// The Stage's one copy of the scene design (stage-only plan, section 3): ONE useDesign for the scene, its design calls (the paid
// cast draws as jobs of the scene, with the job consumer that applies an answer landing after a reload) and the sheet sync
// (useV2Save), with the counted sheet writes that make Redraw wait (useStageDesign.ts holds the hooks and their rules), and the
// scene's one Build the set (useStageBuild.ts: its plan's consumer lives here, so a plan landing while the Render or Export screen
// is up still builds; it also presses Home's handed-over Develop, once).
// Consumers: the words drawer (PromptDrawer), the person maker in The subject's panel (PersonLook), the Setup panel (a scene with
// no set yet), the Set panel's Build the set again and the prop placement. The one-copy rule: two live copies of a draft on one
// page race on its revision (a write refused as another tab's), so the shell mounts this once around the scene's screens;
// everything on the Stage reads and writes through this one.
// `live` false keeps the provider in place (the shell's tree, the 3D viewport in it, is never remounted) with no design in it.
import { createContext, memo, useContext, useLayoutEffect, useState, type ReactNode } from 'react'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { useStageBuild, type StageBuildDeps } from './useStageBuild'
import { useStageDesign, type StageSceneDeps, type StageSceneState } from './useStageDesign'

export type { KitIo, StageSceneDeps } from './useStageDesign'
export type { StageBuildDeps } from './useStageBuild'
/** what the Stage reads of its scene: `x` (the design, its calls, the Bible routes, the library, Build the set), `saving`, the
 *  scene, its world */
export type StageScene = StageSceneState

const Ctx = createContext<StageScene | null>(null)

/** the Stage's scene design, or null outside the provider (or while it is off: the scene not read yet) */
export const useStageScene = (): StageScene | null => useContext(Ctx)

interface Props {
  scene: string
  worldId: string | null
  /** the shell's lab (Build the set lands the new world on it) */
  lab: ProjectionLabState
  children?: ReactNode
  /** the design's routes; `jobs` and `buildKit` also reach Build the set (tests fake them) */
  deps?: StageSceneDeps & StageBuildDeps
  /** false while the scene is not read yet: no design is held here then (default true) */
  live?: boolean
}

export function StageSceneProvider({ scene, worldId, lab, children, deps, live = true }: Props) {
  const [value, setValue] = useState<StageScene | null>(null)
  return (
    <Ctx.Provider value={live ? value : null}>
      {live && <Live key={scene} scene={scene} worldId={worldId} lab={lab} deps={deps} publish={setValue} />}
      {children}
    </Ctx.Provider>
  )
}

/** the design itself, beside the children (so turning it off or switching scenes never remounts them); it hands each state up */
const Live = memo(function Live({ scene, worldId, lab, deps, publish }: Omit<Props, 'children' | 'live'> & { publish: (v: StageScene | null) => void }) {
  const v = useStageDesign(scene, worldId, deps)
  const set = useStageBuild(v, lab, deps)
  const out: StageScene = { ...v, x: { ...v.x, set } }
  useLayoutEffect(() => { publish(out) })
  useLayoutEffect(() => () => publish(null), [publish])
  return null
})

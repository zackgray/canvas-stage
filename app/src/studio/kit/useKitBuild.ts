import { useState } from 'react'
import type { ScenePlan } from '../../stage3d/contract'
import { createKitWorld, getKitWorld, KitRequestError, uploadKitMasterDepth, uploadKitStill } from '../../labs/projection/stage3d/kitApi'
import { renderKitMasterDepth, renderKitStill } from '../../labs/projection/stage3d/kitStill'
import { landingPatch } from '../../labs/projection/location/select'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { currentSceneId, refreshScene } from '../../library/currentScene'

export interface KitBuildDeps {
  create: typeof createKitWorld
  still: typeof renderKitStill
  upload: typeof uploadKitStill
  /** the master view's metric depth and its upload (the Bible master draw holds to it); absent in tests that skip it */
  depth?: typeof renderKitMasterDepth
  uploadDepth?: typeof uploadKitMasterDepth
  /** (set viewport) the world as the server has it now: the Set's still and pre-press depth render from this, never the page's copy */
  read?: typeof getKitWorld
}
const DEPS: KitBuildDeps = { create: createKitWorld, still: renderKitStill, upload: uploadKitStill, depth: renderKitMasterDepth, uploadDepth: uploadKitMasterDepth }

type Lab = Pick<ProjectionLabState, 'refreshShots' | 'set'>

/**
 * "Build world from a description" (free): write the kit world on the server, draw its master view here, upload it (that lists
 * the world) with its metric depth (what the Bible master is drawn on), then land the lab on it, so Shoot opens on the new world.
 * The world is written for the current scene (the server adds it to the scene's worlds and makes it the current set; the scene's
 * older worlds and their takes stay in its list), and the scene is read again once the world is on the stage.
 */
export function useKitBuild(lab: Lab, deps: KitBuildDeps = DEPS) {
  const [phase, setPhase] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [built, setBuilt] = useState<string | null>(null)

  /** the new world's id once built, else null (the caller may be unmounted by then: the lab lands on the new world first) */
  const build = async (plan: ScenePlan, description?: string): Promise<string | null> => {
    setErrors([]); setBuilt(null)
    try {
      setPhase('Writing the world…')
      const scene = currentSceneId()
      const req = { plan, ...(description ? { description } : {}), ...(scene ? { scene } : {}) }
      const w = await deps.create(req)
      setPhase('Drawing the master view…')
      await deps.upload(w.id, await deps.still(w.plan))
      if (deps.depth && deps.uploadDepth) { setPhase('Measuring the master view depth…'); await deps.uploadDepth(w.id, await deps.depth(w.plan)) }
      setPhase('Opening it on the stage…')
      // the world is this scene's whatever happens next, but the stage may now show another scene (opened mid-build): it never lands there
      const patch = currentSceneId() === scene ? landingPatch(await lab.refreshShots(), w.id) : null
      if (patch && currentSceneId() === scene) lab.set(patch)
      setBuilt(w.id)
      if (scene && currentSceneId() === scene) void refreshScene()
      return w.id
    } catch (e) {
      setErrors(e instanceof KitRequestError && e.errors.length ? [e.message, ...e.errors] : [e instanceof Error ? e.message : String(e)])
      return null
    } finally { setPhase(null) }
  }
  return { phase, errors, built, build }
}

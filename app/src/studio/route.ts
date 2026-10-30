// The app's routes: #/studio/<sceneId>/<stage> (the scene library, libraryContract.ts) and #/studio, which names no scene. Pure, so
// it is unit-tested. The stages are Stage, Render, Export; the old Set and Shoot hashes open the Stage (the merge, owner
// 2026-10-26). Any other hash (a stale #/studio/world, the retired #/app/... pages, the old lab index) lands on Home. A route with
// no scene (scene: null) is Home's, whatever stage it names.
import { SCENE_ID_RE } from '../shared/libraryContract'

/** the stages, in order */
export const STAGES = ['stage', 'render', 'export'] as const
export type Stage = (typeof STAGES)[number]

/** `scene`: the library scene the stages show, or null when the route names none (Home's) */
export interface StudioRoute { stage: Stage; scene: string | null }

const isStage = (s: string | undefined): s is Stage => !!s && (STAGES as readonly string[]).includes(s)

/**
 * The studio route for a hash path without its leading "#/" ("studio/sc-…/shoot"), or null when it is not one of the stages'.
 * A bare scene hash and every retired screen's hash (scene, brief, board, set, shoot) open the Stage; the address bar keeps what
 * was typed (no redirect, so no loop).
 */
export function parseStudioRoute(path: string): StudioRoute | null {
  const [where] = path.split('?')
  const parts = where.split('/').filter(Boolean)
  if (parts[0] !== 'studio' || parts.length > 3) return null
  if (parts.length === 1) return { stage: 'stage', scene: null }
  if (SCENE_ID_RE.test(parts[1])) {
    const stage = parts[2] ?? 'stage'
    if (RETIRED_SCREENS.includes(stage)) return { stage: 'stage', scene: parts[1] }
    return isStage(stage) ? { stage, scene: parts[1] } : null
  }
  return parts.length === 2 && isStage(parts[1]) ? { stage: parts[1], scene: null } : null
}

// the screens that were merged into the Stage (SCENE_STAGES keeps set/shoot for saved scenes)
const RETIRED_SCREENS = ['scene', 'brief', 'board', 'set', 'shoot']

/** "#/studio/<scene>/<stage>", or "#/studio/<stage>" without a scene */
export const studioHash = (stage: Stage, scene?: string | null): string => (scene ? `#/studio/${scene}/${stage}` : `#/studio/${stage}`)
/** a scene's own link, on its Stage unless another is given (Home's Resume list, the stepper) */
export const sceneHash = (scene: string, stage: Stage = 'stage'): string => studioHash(stage, scene)
/** Home: the launch screen and the Resume list (no scene named) */
export const HOME_HASH = '#/studio'

/** Where a hash lands: its own route, else Home with the hash to put in the address bar instead (null = keep it). */
export function landingRoute(path: string): { route: StudioRoute; redirect: string | null } {
  const route = parseStudioRoute(path)
  return route ? { route, redirect: null } : { route: { stage: 'stage', scene: null }, redirect: HOME_HASH }
}

/** The neighbouring stage (for the ←/→ keys), or null at either end. */
export function stageStep(stage: Stage, dir: -1 | 1): Stage | null {
  return STAGES[STAGES.indexOf(stage) + dir] ?? null
}

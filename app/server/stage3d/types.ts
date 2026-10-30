/** Contract of /__lab/stage3d (plugin.ts), shared with the browser (src/labs/projection/stage3d/kitApi.ts). Types only. */
import type { PerformancePlan, ScenePlan } from '../../src/stage3d/contract.ts'

/** A kit world's stored performance: the PerformancePlan, plus (appended, wave 2) who plays the 3D performer. */
export type KitPerformance = PerformancePlan & {
  /** the project cast card (Cast step) whose face the hero still gives him; absent = the project's first cast card */
  castId?: string
}

/** A kit world as the routes answer it. */
export interface KitWorld {
  id: string
  description: string
  plan: ScenePlan
  perf: KitPerformance
  /** the still's URL, null until it is uploaded */
  still: string | null
  /** the master view's metric depth (16-bit planar, CLAY_DEPTH_UNIT_M per unit), null until uploaded; the Bible master draws on it */
  masterDepth?: string | null
  createdAt: string
}

export interface CreateKitRequest { plan: unknown; perf?: unknown; description?: unknown
  /** the library scene building it (libraryContract.ts): the world is attached to it and becomes its current set */
  scene?: unknown
  /** (an older client) the hero's own words: accepted and ignored, the performer is the one neutral mannequin */
  hero?: unknown }

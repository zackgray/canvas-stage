// What every Scene design component is handed: the design state, its paid calls, the planner client, the saved cards, the set build.
import type { BibleApi } from './bibleApi'
import type { BriefApi } from './briefApi'
import type { Design } from './design/state'
import type { DesignCalls } from './design/useDesignCalls'
import type { DesignState, LibItem } from './design/useDesign'

/** `build(d)`: builds `d` (Guided's press hands over the design it has just put on the board), else the design as it stands */
export interface SetBuild { build: (d?: Design) => Promise<string | null>; phase: string | null; error: string | null; building: boolean
  /** when the running build began (epoch ms), for its clock; null when idle */
  since?: number | null
  /** the scene's starting world, empty (free): the Stage runs it by itself for a scene with no world; Try again after a failure */
  startEmpty?: () => Promise<string | null> }

export interface SceneCtx {
  s: DesignState
  c: DesignCalls
  api: BriefApi
  lib: LibItem[]
  set: SetBuild
  worldId: string | null
  /** the Bible routes, for keeping an existing world's scene sheet in step with a replaced brief (absent in tests that do not need it) */
  bible?: BibleApi
}

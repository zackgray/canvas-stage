import { defaultMode, defaultParams, type DepthParams } from '../math/depth'
import type { GridMesh } from '../math/grid'
import { conventionForEntry, type BankDepth, type BankShot } from '../engine/manifest'
import type { LookMode } from '../engine/look'
import type { ViewMode } from '../splats/SplatView'

/** the source when no set is on the stage (a scene with no world yet): plain ground and sky, never a built-in test set */
export const NO_SET = ''

export interface Settings {
  /** a shot id from the bank manifest, or '' when the stage has no set */
  source: string
  depthIndex: number
  depth: DepthParams
  /** relative depth jump that cuts a triangle, as a fraction */
  edge: number
  planeAware: boolean
  /** cut set triangles seen closer than this to edge-on from the projector (degrees; 90 = off): holes, not streaks */
  graze: number
  /** pixels between mesh vertices */
  step: number
  focal: number
  /** AI depth clean-up: bilateral de-terracing of 8-bit maps, and soft-edge snapping radius (px) */
  dequantize: boolean
  sharpen: number
  holeMask: boolean
  dolly: number
  /** live display: projection mesh, splats or both (captures always use the mesh) */
  view: ViewMode
  /** live look: the still on the set, or grey blocking geometry (captures always render textured) */
  look: LookMode
  /** splat per `stride` px of the depth map */
  stride: number
}

export const DEFAULT_SETTINGS: Settings = {
  source: NO_SET,
  depthIndex: 0,
  depth: defaultParams('inverse'),
  edge: 0.04,
  planeAware: true,
  graze: 86,
  step: 2,
  focal: 35,
  dequantize: true,
  sharpen: 3,
  holeMask: false,
  dolly: 1.5,
  view: 'mesh',
  look: 'textured',
  stride: 2,
}

/** Starting depth params for a bank depth map: inverse for near-bright, metric passthrough when units are known. */
export function paramsForEntry(entry: BankDepth | undefined): DepthParams {
  if (!entry) return defaultParams('inverse')
  const mode = defaultMode(conventionForEntry(entry))
  const full = entry.metersPerUnit ? entry.metersPerUnit * (2 ** (entry.bitDepth || 8) - 1) : undefined
  return defaultParams(mode, full)
}

/** The patch that makes `id` the source, as picking it in the Source list does; `depth` is kept when `id` is not a bank shot. */
export function sourcePatch(shots: BankShot[] | null, id: string, depth: DepthParams): Partial<Settings> {
  const next = shots?.find((x) => x.id === id)
  return { source: id, depthIndex: 0, depth: next ? paramsForEntry(next.depths[0]) : depth }
}

export interface Readouts {
  status: string
  grid: GridMesh | null
  /** near/far of the converted depth */
  range: { min: number; max: number } | null
  exporting: string | null
}

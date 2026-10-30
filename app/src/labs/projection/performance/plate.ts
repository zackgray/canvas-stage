// The set behind a performance from the performance's own clean plate (t29). The lift writes the clip's clean median
// plate (background.png) and its depth (background_depth.png: the median of the lift's own scaled depth where the
// pixel is clean) into the pack. With the plate as the set, the warp's room is the source clip's room — the same
// columns, windows and light CrossView sees in the source — instead of the location's AI still re-projected beside it,
// and set and actors share one camera (the pack's: the set's projector, field of view narrowed by the lift's crop).
// background.png is 1920 wide on a new lift and 960 on an older pack: the texture is sampled by uv, so either loads; only
// the depth must be the pack's size.
import type { Texture } from 'three'
import { packUrl, type PerformancePack } from '../../../project/performance'
import { conventionForEntry, type BankDepth, type Lens } from '../engine/manifest'
import type { ProjectionSource } from '../engine/projectionSource'
import { loadDepthImage, loadStill } from '../engine/sources'
import { focalFromVfov, toRad } from '../math/camera'
import { toDepth, type DepthParams } from '../math/depth'
import { sharpenEdges } from '../math/filters'

export interface Plate {
  packId: string
  locationId: string
  texture: Texture
  /** planar metres in the pack's camera, NaN = no depth; top row first */
  metres: Float32Array
  width: number
  height: number
  vfovDeg: number
  aspect: number
}

/** Fetch a pack's plate colour + depth; throws when the pack has no plate depth or it does not fit the pack. */
export async function loadPlate(pack: PerformancePack): Promise<Plate> {
  const bd = pack.backgroundDepth
  if (!bd) throw new Error(`performance ${pack.id} has no plate depth (lifted before t29: re-run the lift or scripts/pack-plate-depth.ts)`)
  const [texture, img] = await Promise.all([loadStill(packUrl(pack.id, pack.background)), loadDepthImage(packUrl(pack.id, bd.file))])
  if (img.bits !== 16 || img.width !== pack.width || img.height !== pack.height) {
    texture.dispose()
    throw new Error(`performance ${pack.id}: ${bd.file} is not a 16-bit ${pack.width}×${pack.height} depth`)
  }
  const metres = img.values.map((v) => (v > 0 ? v * 65535 * bd.metersPerUnit : NaN))
  return { packId: pack.id, locationId: pack.locationId, texture, metres, width: pack.width, height: pack.height, vfovDeg: pack.source.vfovDeg, aspect: pack.source.aspect }
}

/**
 * The plate as the set's projection source. Its metres go through the lab's depth settings the way the location's own
 * metric map does (normalised on that map's full scale), so a depth scale or shift the user set moves both alike.
 * `exportSize`: the location still's size, so stills and guides export at the size they always did. Null when the
 * location's depth is not a metric map (the lift only lifts onto metric sets, so a plate always has one).
 */
export function plateSource(p: Plate, entry: BankDepth | undefined, params: DepthParams, clean: { sharpen: number; edge: number },
  exportSize: { width: number; height: number }): ProjectionSource | null {
  const full = entry?.metric && entry.metersPerUnit ? entry.metersPerUnit * (2 ** (entry.bitDepth || 16) - 1) : 0
  if (!entry || !(full > 0) || conventionForEntry(entry) !== 'near-dark') return null
  const values = p.metres.map((m) => (m > 0 ? Math.min(1, m / full) : 0))
  const depth = sharpenEdges(toDepth({ width: p.width, height: p.height, values }, 'near-dark', params), p.width, p.height, clean.sharpen, clean.edge)
  return { texture: p.texture, depth, depthWidth: p.width, depthHeight: p.height, width: exportSize.width, height: exportSize.height }
}

/** The projector lens while the plate is the set: the pack's camera. */
export function plateLens(p: Plate): Lens {
  const focalMm = focalFromVfov(toRad(p.vfovDeg), p.aspect)
  return { vfovDeg: p.vfovDeg, focalMm, from: 'manifest', label: `vfov ${p.vfovDeg.toFixed(2)}° from performance ${p.packId} (the lift's crop) ≈ ${focalMm.toFixed(1)} mm` }
}

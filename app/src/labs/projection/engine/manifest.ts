// Depth manifests the lab reads, merged into one shot list. Pure (no DOM), so it is unit-tested.
//
// Manifest fields honoured beyond the bank's own:
//   fovDeg  vertical FOV in degrees, on a depth entry or on the shot (the entry wins). When present it sets the
//           projector lens; the focal slider is only used when no manifest FOV exists.
//   metric  on a depth entry: 16-bit linear metres = raw * metersPerUnit, near-dark, 0 = invalid / sky.
// Shot-level `metric` is NOT applied to entries: one shot mixes metric maps with relative ones (DA-V2).

import { focalFromVfov, toDeg, toRad, vfovFromFocal } from '../math/camera'
import type { DepthConvention } from '../math/depth'

export { MANIFEST_URLS } from './manifestUrls'

export interface BankDepth {
  model: string
  path: string
  convention: DepthConvention
  bitDepth: number
  /** optional: metres per raw unit, for metric passthrough */
  metersPerUnit?: number
  /** 16-bit linear metres, near-dark, 0 = invalid */
  metric?: boolean
  /** vertical FOV in degrees for this depth map's camera */
  fovDeg?: number
}

export interface BankShot {
  /** unique within the merged list (may be prefixed, e.g. "e2/wide") */
  id: string
  image: string
  width: number
  height: number
  prompt: string
  /** a person-given name for the set, shown instead of the description's first words */
  name?: string
  seed: number
  depths: BankDepth[]
  /** vertical FOV in degrees for the still */
  fovDeg?: number
  /** manifest URL this shot came from */
  manifest?: string
  /** the batch that made it; Place's closer plates are "place-<sid>" */
  batch?: string
  registered?: { source?: string; from?: string }
}

/** Short tag for a manifest URL: its folder name ("bank", "e2"). */
export const manifestTag = (url: string) => url.split('/').slice(-2, -1)[0] || url

/** Shots from one manifest's JSON text, or null if it is not a manifest (Vite may serve index.html instead). */
export function parseManifest(text: string, url: string): BankShot[] | null {
  try {
    const json = JSON.parse(text) as { shots?: BankShot[] }
    if (!Array.isArray(json.shots)) return null
    return json.shots.filter((s) => s.id && s.image && Array.isArray(s.depths)).map((s) => ({ ...s, manifest: url }))
  } catch {
    return null
  }
}

/** Merge per-manifest shot lists in order; null when none loaded. Colliding ids get the manifest's tag. */
export function mergeManifests(lists: { url: string; shots: BankShot[] | null }[]): BankShot[] | null {
  const out: BankShot[] = []
  const ids = new Set<string>()
  let any = false
  for (const { url, shots } of lists) {
    if (!shots) continue
    any = true
    for (const s of shots) {
      const id = ids.has(s.id) ? `${manifestTag(url)}/${s.id}` : s.id
      ids.add(id)
      out.push({ ...s, id })
    }
  }
  return any ? out : null
}

/** Metric maps are near-dark linear whatever else the entry says. */
export function conventionForEntry(entry: BankDepth): DepthConvention {
  return entry.metric ? 'near-dark' : entry.convention
}

export interface Lens {
  /** vertical FOV, degrees */
  vfovDeg: number
  /** 36 mm-equivalent focal that gives this vfov at the given aspect (what the projector is set from) */
  focalMm: number
  from: 'manifest' | 'slider'
  /** human-readable: which source and value is in effect */
  label: string
}

/** The projector lens for a shot/depth entry: the manifest's vertical FOV when it has one, else the slider. */
export function lensFor(shot: BankShot | undefined, entry: BankDepth | undefined, sliderFocalMm: number, aspect: number): Lens {
  const fov = entry?.fovDeg ?? shot?.fovDeg
  if (typeof fov === 'number' && fov > 0 && fov < 180) {
    const focalMm = focalFromVfov(toRad(fov), aspect)
    const where = entry?.fovDeg !== undefined ? `${entry.model}` : 'shot'
    const from = shot?.manifest ? manifestTag(shot.manifest) : 'manifest'
    return { vfovDeg: fov, focalMm, from: 'manifest', label: `vfov ${fov}° from ${from} manifest (${where}) ≈ ${focalMm.toFixed(1)} mm` }
  }
  const vfovDeg = toDeg(vfovFromFocal(sliderFocalMm, aspect))
  return { vfovDeg, focalMm: sliderFocalMm, from: 'slider', label: `${sliderFocalMm} mm source-lens slider (no FOV in manifest) ≈ vfov ${vfovDeg.toFixed(1)}°` }
}

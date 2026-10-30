// Landing in a new location: the settings patch that makes it the lab's source, exactly as picking it in the
// source list does (Panel's pickSource). Changing `source` is what clears settled layers (ProjectionLab's load
// effect), so a programmatic switch clears them too.
import type { BankShot } from '../engine/manifest'
import { paramsForEntry, type Settings } from '../ui/settings'

export const LOCATIONS_MANIFEST = '/lab-assets/locations/manifest.json'

/** The registered location a set card stands for (its still is /lab-assets/locations/<id>/still.png), or null (bank, synthetic). */
export function registeredLocationId(shots: BankShot[] | null, source: string): string | null {
  const shot = shots?.find((x) => x.id === source && x.manifest === LOCATIONS_MANIFEST)
  return shot ? /\/lab-assets\/locations\/([\w-]+)\/[^/]+$/.exec(shot.image)?.[1] ?? null : null
}

/** The shot as the merged list names it (ids are prefixed on collision), or undefined if it is not listed yet. */
export function findLocation(shots: BankShot[] | null, location: string): BankShot | undefined {
  return shots?.find((s) => s.manifest === LOCATIONS_MANIFEST && (s.id === location || s.id.endsWith(`/${location}`)))
}

export function landingPatch(shots: BankShot[] | null, location: string): Partial<Settings> | null {
  const shot = findLocation(shots, location)
  if (!shot) return null
  return { source: shot.id, depthIndex: 0, depth: paramsForEntry(shot.depths[0]) }
}

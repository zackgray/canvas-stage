/**
 * The world a locked take was shot on, as the back half (clay, hero, render) needs it: is it a kit world, and if so its plan and
 * stored performance. A take's worldId is the lab's source id, which a merged source list may prefix (`<list>/loc-…`); the
 * location id is its last segment (src/labs/projection/stage3d/kitApi.ts kitWorldId). Read-only.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { readWorld } from '../../src/shared/worldContract.ts'
import { LOCATION_RE } from '../location/request.ts'
import { KitStore } from './store.ts'
import type { KitWorld } from './types.ts'

/** the location id inside a take's worldId */
export const bareWorldId = (worldId: string) => worldId.replace(/^.*\//, '')

/** true when the take's world is a kit world (meta.json world.kind 'kit'); panorama worlds and unknown ids are false */
export function isKitWorld(publicDir: string, worldId: string): boolean {
  const id = bareWorldId(worldId)
  if (!LOCATION_RE.test(id)) return false
  try {
    const meta = JSON.parse(readFileSync(path.join(publicDir, 'lab-assets', 'locations', id, 'meta.json'), 'utf8')) as { world?: unknown }
    return !!meta.world && readWorld(meta.world).kind === 'kit'
  } catch { return false }
}

/** the kit world behind the take (plan + performance), or null when it is not a kit world or its files do not read */
export function takeKitWorld(publicDir: string, worldId: string): KitWorld | null {
  if (!isKitWorld(publicDir, worldId)) return null
  try { return new KitStore(publicDir).read(bareWorldId(worldId)) } catch { return null }
}

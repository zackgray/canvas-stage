// Fetch what the world root scale needs for a set: the set location's level.json and meta.json (its lens), and the
// meta.json of the world it belongs to (its `world.eyeHeightM`; a Place plate's world is its source, worldId.ts).
import { fetchLevelFile, locationOfSource, worldLevel, type Level } from './level'
import type { FloorPlane } from './groundMatch'
import { resolveWorldId } from './worldId'
import { lensVfovOf, worldScaleOf, type WorldScale } from './worldScale'

type Get = (url: string, init?: RequestInit) => Promise<Response>

const metaOf = async (id: string, get: Get): Promise<unknown> => {
  try {
    const r = await get(`/lab-assets/locations/${encodeURIComponent(id)}/meta.json`, { cache: 'no-cache' })
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

/** The scale of the set `sourceId` shows (a lab source id: `<manifest>/<location id>` or the location id). */
export async function fetchWorldScale(sourceId: string, get: Get = fetch): Promise<WorldScale> {
  const id = locationOfSource(sourceId)
  const [level, own, worldId] = await Promise.all([
    fetchLevelFile(sourceId, get as typeof fetch), metaOf(id, get), resolveWorldId(id, (u) => get(u, { cache: 'no-cache' })),
  ])
  const world = worldId === id ? own : await metaOf(worldId, get)
  return worldScaleOf(world, level, lensVfovOf(own))
}

/** The set's floor plane for the surround's ground match (projector camera space, app units before the scale). */
export function setFloorOf(ws: WorldScale): FloorPlane | null {
  const lv = ws.level
  return lv && lv.method === 'floor-ransac' && lv.cameraHeightM ? { up: lv.up, h: lv.cameraHeightM } : null
}

/** The scaled level the rigs and the orbit use: up from the lens-corrected file, the floor s·h below the projector. */
export function scaledLevel(ws: WorldScale, projector: Parameters<typeof worldLevel>[1]): Level | null {
  return ws.level ? worldLevel(ws.level, projector, ws.s) : null
}

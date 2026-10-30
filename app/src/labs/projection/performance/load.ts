// Performance packs on disk (track C writes them): /lab-assets/performances/<id>/manifest.json + per-frame colour, depth
// and mask PNGs. The list of packs is /lab-assets/performances/index.json ({ performances: [ids] }, kept by the lift tool,
// scripts/lift-performance.ts; a static server cannot list a folder).
import { framePath, packUrl, parsePerformance, PERFORMANCES_URL as PERFORMANCES, type PerformancePack } from '../../../project/performance'
import { decodeActorFrame, type ActorCrop } from './decode'
import { parseIndex } from './frames'

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export interface PackEntry { id: string; label: string; locationId: string; frames: number; fps: number }

export async function fetchPack(id: string, f: Fetch = fetch): Promise<PerformancePack> {
  const res = await f(`${PERFORMANCES}/${id}/manifest.json`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`performance ${id}: manifest HTTP ${res.status}`)
  const pack = parsePerformance(await res.text())
  if (pack.id !== id) throw new Error(`performance ${id}: its manifest says id "${pack.id}"`)
  return pack
}

/** Every pack listed (unreadable ones skipped); [] when there is no index yet. */
export async function listPacks(f: Fetch = fetch): Promise<PackEntry[]> {
  let ids: string[]
  try {
    const res = await f(`${PERFORMANCES}/index.json`, { cache: 'no-store' })
    ids = res.ok ? parseIndex(await res.json()) : []
  } catch { return [] }
  const packs = await Promise.all(ids.map((id) => fetchPack(id, f).catch(() => null)))
  return packs.filter((p): p is PerformancePack => !!p).map((p) => ({ id: p.id, label: p.label, locationId: p.locationId, frames: p.frames, fps: p.fps }))
}

const bytes = async (f: Fetch, url: string) => {
  const res = await f(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

/** Fetch and decode every frame of a pack (a few at a time), cropped to its actors. */
export async function loadPack(pack: PerformancePack, onProgress?: (done: number, total: number) => void, f: Fetch = fetch, parallel = 6): Promise<ActorCrop[]> {
  if (pack.depth?.encoding !== 'planar-metres-16bit') throw new Error(`performance ${pack.id}: depth encoding "${pack.depth?.encoding}" is not planar-metres-16bit`)
  const out: ActorCrop[] = new Array(pack.frames)
  let next = 0, done = 0
  const worker = async () => {
    while (next < pack.frames) {
      const i = next++
      const [c, d, m] = await Promise.all([pack.files.color, pack.files.depth, pack.files.mask].map((p) => bytes(f, packUrl(pack.id, framePath(p, i)))))
      out[i] = await decodeActorFrame(i, c, d, m, pack.depth.metersPerUnit)
      onProgress?.(++done, pack.frames)
    }
  }
  await Promise.all(Array.from({ length: Math.min(parallel, pack.frames) }, worker))
  return out
}

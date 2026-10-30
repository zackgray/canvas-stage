// Shared set-up for the per-take performance tests: a temp public/ with a kit world and hand-written take.json files.
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PLANS } from '../../../src/stage3d/presets.ts'
import { mocapPackId } from '../../../src/stage3d/planHash.ts'
import { shotPaths, type TakeRecord } from '../../../src/shared/shotContract.ts'
import { KitStore } from '../../stage3d/store.ts'
import type { KitPerformance } from '../../stage3d/types.ts'
import { writeJson } from '../takeFiles.ts'

export const plan = Object.values(PLANS)[0]
export const tempPub = (tag: string) => mkdtempSync(path.join(tmpdir(), `take-perf-${tag}-`))

/** a walk the world can save (two points, some length); `dz` moves its end (a save snaps the start to the mark) */
export const walk = (dz = 0, castId?: string): KitPerformance => ({ path: [[0, -10], [0, -4 + dz]], pace: 0.8, shotSeconds: 6, ...(castId ? { castId } : {}) })

let n = 0
/** a take.json on disk, written as the server writes it */
export function putTake(pub: string, over: Partial<TakeRecord> & Pick<TakeRecord, 'worldId' | 'packId'>): TakeRecord {
  const id = `take-2026-10-29T10-00-00-${String(++n).padStart(3, '0')}`
  const t: TakeRecord = { id, fps: 24, frames: 97, samples: [{ t: 0, position: [0, 1.6, 0], quaternion: [0, 0, 0, 1], focal: 35 }], focal: 35,
    viewAspect: 16 / 9, perfStart: 0, startKey: 'k', lockedAt: `2026-10-29T10:00:${String(n % 60).padStart(2, '0')}.000Z`, createdAt: '2026-10-29T10:00:00.000Z', ...over }
  writeJson(path.join(pub, shotPaths(id).take), t)
  return t
}

export const onDisk = (pub: string, id: string) => JSON.parse(readFileSync(path.join(pub, shotPaths(id).take), 'utf8')) as TakeRecord

/** a kit world whose performance.json is `perf` (saved through the store, so it is what the store reads back) */
export function kitWorld(pub: string, perf?: KitPerformance) {
  const s = new KitStore(pub)
  const w = s.create({ plan })
  const saved = perf ? s.savePerformance(w.id, perf) : w
  return { store: s, id: w.id, perf: saved.perf, packId: mocapPackId(saved.perf) }
}

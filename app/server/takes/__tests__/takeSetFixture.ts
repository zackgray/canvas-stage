// Shared set-up for the per-take set tests: a temp public/ with a kit world (its set key and setChangedAt), a take's clay date.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PLANS } from '../../../src/stage3d/presets.ts'
import { setKeyOf } from '../../../src/studio/shoot/setKey.ts'
import { shotPaths } from '../../../src/shared/shotContract.ts'
import { KitStore } from '../../stage3d/store.ts'

export const setPlan = PLANS['open-field-day']

/** a kit world on the open-field plan: `key()` is the set key of plan.json as the store reads it now */
export function setWorld(pub: string) {
  const store = new KitStore(pub)
  const w = store.create({ plan: setPlan }, new Date('2026-10-29T09:00:00.000Z'))
  return { store, id: w.id, plan: () => store.read(w.id).plan, key: () => setKeyOf(store.read(w.id).plan)! }
}

/** a done clay for the take, started at `at` (as clay.json records it) */
export function putClay(pub: string, takeId: string, at: string) {
  const dir = path.join(pub, shotPaths(takeId).clay)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'clay.json'), JSON.stringify({ takeId, status: 'done', startedAt: at, finishedAt: at }))
}

// Reset the set: the plan as Build the set placed it, kept beside the live plan (plan.built.json) so the Stage's Reset the set can
// put every piece back. Written when the world is created; a generated piece that lands later is placed in it the same way it is
// placed in the live plan, so a reset keeps the built meshes. A world built before this existed has no copy: Reset says so (409).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parsePlan } from '../../src/stage3d/plan.ts'
import type { ScenePlan } from '../../src/stage3d/contract.ts'
import { KitError } from './errors.ts'
import { snapToMark } from './markStart.ts'
import type { KitStore } from './store.ts'
import type { KitWorld } from './types.ts'

export const BUILT_FILE = 'plan.built.json'
export const NOT_BUILT_HERE = 'This set was built before Reset existed, so there is nothing to put it back to.'

const builtPath = (store: KitStore, id: string) => path.join(store.dir(id), BUILT_FILE)
const write = (file: string, plan: ScenePlan) => writeFileSync(file, JSON.stringify(plan, null, 2) + '\n')

/** the plan as Build the set placed it (called once, when the world is created) */
export function writeBuilt(dir: string, plan: ScenePlan): void { write(path.join(dir, BUILT_FILE), plan) }

function readBuilt(store: KitStore, id: string): ScenePlan | null {
  const file = builtPath(store, id)
  if (!existsSync(file)) return null
  try { const p = parsePlan(JSON.parse(readFileSync(file, 'utf8'))); return p.ok ? p.plan : null } catch { return null }
}

/** a generated piece landed: place it in the built copy as it was placed in the live plan (nothing when there is no copy) */
export function placeInBuilt(store: KitStore, id: string, change: (plan: ScenePlan) => ScenePlan['kit']): void {
  const built = readBuilt(store, id)
  if (built) write(builtPath(store, id), { ...built, kit: change(built) })
}

/** every piece and the mark back where Build the set put them; a set change like any other (the approval goes stale) */
const withGround = (plan: ScenePlan, ground: ScenePlan['ground']): ScenePlan => {
  const { ground: _old, ...rest } = plan // eslint-disable-line @typescript-eslint/no-unused-vars
  return ground ? { ...rest, ground } : rest
}

export function resetToBuilt(store: KitStore, id: string, now = new Date()): KitWorld {
  const built = readBuilt(store, id)
  if (!built) throw new KitError(409, NOT_BUILT_HERE)
  // the ground's shape is the scene's choice, not a piece: a reset keeps it
  const w = store.changePlan(id, (plan) => withGround(built, plan.ground), now)
  // the hero's start is the mark (markStart.ts): a stand turns and moves with it
  const snapped = snapToMark(w.perf, w.plan)
  return snapped === w.perf ? w : store.savePerformance(id, snapped)
}

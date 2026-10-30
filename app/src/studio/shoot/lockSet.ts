// What Lock take sends as the take's own set (PLAN-PER-TAKE-SET.md, Design; TakeLockSet): the kit plan on the stage, exactly as the
// page holds it (the server re-parses and hashes it strictly; a rebuilt object with another key order would hash differently and
// an honest lock would be refused). Only beside the set key it is (`setKey`); else nothing (the server then copies the scene's set
// when it is still this one, as for an older page).
import type { ScenePlan } from '../../stage3d/contract'
import type { TakeLockSet } from '../../shared/takeSetContract'
import { setKeyOf } from './setKey'

export function lockSetOf(setKey: string | null | undefined, plan: unknown): TakeLockSet {
  return setKey && plan && setKeyOf(plan) === setKey ? { set: plan as ScenePlan } : {}
}

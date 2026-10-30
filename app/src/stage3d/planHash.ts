// The performance's id: pure (no three.js), so the server can check a take's own performance against its pack id
// (server/takes/takePerf.ts) with the same function the page names its mocap layer by. Moved here unchanged from
// src/labs/projection/stage3d/MocapLayer.ts, which re-exports it. Never change its output: every locked take's packId is it.
import type { PerformancePlan } from './contract.ts'

/**
 * FNV-1a 32 of the plan's canonical JSON: the same motion gives the same id, any change to it (path, actions, pace, gait, turn
 * radius, extras) a new one, so a take locked on the old motion reads as another performance. castId is not motion and is left
 * out. Extras (E1) join only when there are any, so plans without them keep their ids.
 * turnRadius joins the text only when set, so plans without it keep the ids they were locked with; (wave A) so do stand (only
 * when true; false means the same walk as unset) and shotSeconds, appended last. An old file's costume stays in the text (no figure
 * is built from it any more, but a take locked on it keeps its pack id); new performances carry none.
 */
export function planHash(plan: PerformancePlan): string {
  const text = JSON.stringify({ path: plan.path, actions: plan.actions ?? [], pace: plan.pace ?? null, gait: plan.gait ?? null,
    ...(plan.turnRadius !== undefined ? { turnRadius: plan.turnRadius } : {}),
    ...(plan.costume !== undefined ? { costume: plan.costume } : {}), ...(plan.creatures?.length ? { creatures: plan.creatures } : {}),
    ...(plan.extras?.length ? { extras: plan.extras } : {}),
    ...(plan.stand === true ? { stand: true } : {}), ...(plan.shotSeconds !== undefined ? { shotSeconds: plan.shotSeconds } : {}) })
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}

/** the pack id a mocap layer playing this plan carries (MocapLayer mocapPack) */
export const mocapPackId = (plan: PerformancePlan): string => `mocap-${planHash(plan)}`

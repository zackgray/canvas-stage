/**
 * The scene brief's key light on the 3D set (the prompt wave's join, 2026-10-25): Build the set sends the v2 brief's `light` with the
 * plan request, and every plan the run returns (first try, retry or repaired) has its `light` replaced by planLight.ts lightRecipe
 * (height -> elevation, direction -> bearing, quality -> fill/key), so the set is lit the way the still is written. A brief light with
 * no height says too little: the planner's own recipe (from the sentence's words) stands. Pure; free.
 */
import type { BriefLight } from '../../src/shared/briefContract.ts'
import type { ScenePlan } from '../../src/stage3d/contract.ts'
import { lightRecipe } from '../../src/stage3d/planLight.ts'

export type PlanLight = Pick<BriefLight, 'height' | 'direction' | 'quality'>
const HEIGHTS = ['low', 'high', 'overhead', ''], QUALITIES = ['hard', 'soft', '']

/** the request's `light` as the recipe reads it; null when absent; a string error when it is not a brief light */
export function planLightOf(v: unknown): PlanLight | null | string {
  if (v === undefined || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof v !== 'object' || Array.isArray(v)) return 'light must be the scene brief\'s light object'
  const height = o.height ?? '', direction = o.direction ?? '', quality = o.quality ?? ''
  if (typeof height !== 'string' || !HEIGHTS.includes(height)) return 'light.height must be low, high, overhead or empty'
  if (typeof quality !== 'string' || !QUALITIES.includes(quality)) return 'light.quality must be hard, soft or empty'
  if (typeof direction !== 'string' || direction.length > 300) return 'light.direction must be text of at most 300 characters'
  return { height: height as PlanLight['height'], direction, quality: quality as PlanLight['quality'] }
}

/** the plan lit by the brief's light (its own light kept when the brief gives no height) */
export function withBriefLight<P extends Pick<ScenePlan, 'light'>>(plan: P, light: PlanLight | null | undefined): P {
  const r = lightRecipe(light)
  return r ? { ...plan, light: r } : plan
}

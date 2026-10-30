// Stage3D light recipe from the scene brief (prompt wave, Track F). Pure: a SceneBriefV2 light (height, direction, quality) in, the plan's
// `light` numbers out, so the 3D set is lit the way the still is written. Wired by the planner, not here. null = the brief says too
// little (no height) and the plan keeps the sentence-word recipe. The world places the key at (sin yaw, ·, -cos yaw) with the camera
// looking toward -z: yaw 0 = far ahead (behind a subject facing us), 90 = right of frame, 180 = behind the camera, 270 = left.
import type { BriefLight } from '../shared/briefContract.ts'

/** longest kit-item label a plan may carry */
export const LABEL_MAX = 120

export interface LightRecipe { fill: number; key: number; keyDir: [number, number] }

const ELEV = { low: 12, high: 55, overhead: 75 } as const
const BASE = {
  low: { fill: 1.4, key: 1.1 }, high: { fill: 1.3, key: 1.2 }, overhead: { fill: 1.2, key: 1.2 },
} as const

/** the key's bearing from the direction words: behind the subject, in front, or to one side; left/right of frame; else a three-quarter front */
export function azimuthOf(direction: string): number {
  const d = direction.toLowerCase()
  const left = /\bleft\b/.test(d), right = /\bright\b/.test(d)
  const overCamera = /\b(behind|over|above)\s+(the\s+)?(camera|lens|viewer)\b|\b(from|at)\s+(the\s+)?(camera|front)\b|\bfront[- ]?(lit|light)\b|\bin front\b/.test(d)
  const behind = !overCamera && /\b(behind|backlit?|back[- ]?lit|rim|towards? (the )?camera|toward(s)? us)\b/.test(d)
  if (behind) return left ? 330 : right ? 30 : 15
  if (overCamera) return left ? 220 : right ? 140 : 160
  if (left) return 270
  if (right) return 90
  return 140
}

/** the plan light for a brief's light; null when the brief has no height (then the sentence recipe stands) */
export function lightRecipe(light: Pick<BriefLight, 'height' | 'direction' | 'quality'> | null | undefined): LightRecipe | null {
  if (!light || !light.height) return null
  const b = BASE[light.height], soft = light.quality === 'soft'
  return {
    fill: soft ? +(b.fill + 0.3).toFixed(2) : b.fill,
    key: soft ? +(b.key * 0.8).toFixed(2) : b.key,
    keyDir: [azimuthOf(light.direction ?? ''), ELEV[light.height]],
  }
}

/**
 * How hard a kit still (or master) is held to the 3D set's depth, as two named presets (recipe wave, E139 M2): the Fun ControlNet
 * Union's strength and the share of the steps it acts for (end_percent). 'photographic' is the recipe default: 0.65 released at
 * 0.50 is what made the still read as a photograph while holding the layout (E139 M1: massing depth at 0.95 alone gave no gain).
 * 'tight' is the pre-recipe lock (0.95 to the end). The UI shows the names; the numbers only in the tooltip. Pure (the browser
 * imports it for the labels).
 */
import { isLockPreset, type LockPresetId } from '../../src/shared/stillPressContract.ts'

export { isLockPreset, type LockPresetId }

export interface LockPreset { id: LockPresetId; label: string; strength: number; end: number; title: string }

export const LOCK_PRESETS: Record<LockPresetId, LockPreset> = {
  photographic: { id: 'photographic', label: 'Photographic', strength: 0.65, end: 0.5,
    title: 'Holds the set loosely and lets go halfway through the draw, so the still reads as a photograph (depth 0.65, released at 50%). The recipe default.' },
  tight: { id: 'tight', label: 'Tight', strength: 0.95, end: 1,
    title: 'Holds every edge of the 3D set to the last step: the layout is exact but the still looks more like CG (depth 0.95, held to 100%).' },
}

/** a still press with no preset draws photographic */
export const DEFAULT_LOCK: LockPresetId = 'photographic'

/** what the draw is held with, and the preset it came from (null = a raw strength from an older caller) */
export interface Lock { preset: LockPresetId | null; strength: number; end: number }

/** A press's lock: its preset; else a raw strength held to the end (the pre-recipe behaviour, kept for old callers); else the default. */
export function lockFor(f: { preset?: LockPresetId; depthStrength?: number }, fallback: LockPresetId = DEFAULT_LOCK): Lock {
  if (f.preset) return { preset: f.preset, strength: LOCK_PRESETS[f.preset].strength, end: LOCK_PRESETS[f.preset].end }
  if (f.depthStrength !== undefined) return { preset: null, strength: f.depthStrength, end: 1 }
  const p = LOCK_PRESETS[fallback]
  return { preset: p.id, strength: p.strength, end: p.end }
}

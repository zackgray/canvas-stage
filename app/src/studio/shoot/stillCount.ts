// How many stills one "Draw this frame" press draws (owner decision 2026-10-25: the owner picks 1 or 2 per press to control spend;
// 1 by default), remembered for the browser session so every keyframe and every take presses with the same choice until changed.
import { useState } from 'react'
import { DEFAULT_STILL_SEEDS } from '../../../server/hero/kitSpec'

export type StillCount = 1 | 2
export const STILL_COUNTS: readonly StillCount[] = [1, 2]
const KEY = 'canvas-stage.still-count'

/** the session's choice, else the default (a storage that is off or holds anything else reads as the default) */
export function readStillCount(): StillCount {
  try {
    const v = Number(sessionStorage.getItem(KEY))
    if (v === 1 || v === 2) return v
  } catch { /* storage off: the default */ }
  return (DEFAULT_STILL_SEEDS as number) === 2 ? 2 : 1
}

/** the press's count and its setter; the setter writes the session's memory */
export function useStillCount(): [StillCount, (n: StillCount) => void] {
  const [n, setN] = useState<StillCount>(readStillCount)
  return [n, (v) => { setN(v); try { sessionStorage.setItem(KEY, String(v)) } catch { /* storage off: this page only */ } }]
}

/** (consistency pass) the Stage's own choice, remembered for the scene (its world) in this browser; null until the owner picks one */
export function readRememberedSceneStillCount(scene: string | null): StillCount | null {
  try { const v = localStorage.getItem(`${KEY}.${scene ?? ''}`); return v === '2' ? 2 : v === '1' ? 1 : null } catch { return null }
}

/** the scene's count: the owner's remembered choice, else `fallback` (the Stage draws 2 from the approved frame, 1 otherwise) */
export const readSceneStillCount = (scene: string | null, fallback: StillCount = 1): StillCount => readRememberedSceneStillCount(scene) ?? fallback

/** the Stage press's count for this scene and its setter (the setter writes the scene's memory); the fallback applies only while none is remembered */
export function useSceneStillCount(scene: string | null, fallback: StillCount = 1): [StillCount, (n: StillCount) => void] {
  const [s, setS] = useState<{ scene: string | null; n: StillCount | null }>(() => ({ scene, n: readRememberedSceneStillCount(scene) }))
  const n = (s.scene === scene ? s.n : readRememberedSceneStillCount(scene)) ?? fallback
  return [n, (v) => { setS({ scene, n: v }); try { localStorage.setItem(`${KEY}.${scene ?? ''}`, String(v)) } catch { /* storage off: this page only */ } }]
}

/** the two-way choice's label: "1 still · 21 cr" / "2 stills · 42 cr", the price from the press's own price function */
export const countLabel = (n: StillCount, price: number) => `${n} ${n === 1 ? 'still' : 'stills'} · ${price} cr`

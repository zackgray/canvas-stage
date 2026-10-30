// How the Stage draws the first frame (draw-from-master): "From words and the set" (depth, today's press, the default) or "From your
// approved frame" (edit: takes the clothes and the place from the scene's look frame). The choice is remembered per scene in this
// browser, like the 1-or-2 stills choice (stillCount.ts). The hook turns the press preview into the model the Stage row shows
// (heroPublished.ts HeroDrawModeModel); the block only passes it through. Words here are the owner's: "the approved frame",
// "the empty set" — never the model or graph names.
import { useState } from 'react'
import { HERO_LOOK_ROUTE, isDrawMode, type DrawMode, type StillPreviewResponse } from '../../shared/stillPressContract'
import type { HeroDrawModeModel } from './heroPublished'

const KEY = 'canvas-stage.draw-mode'

/** the owner's own choice for the scene, or null while they have not made one */
export function readExplicitDrawMode(scene: string | null): DrawMode | null {
  try { const v = localStorage.getItem(`${KEY}.${scene ?? ''}`); return isDrawMode(v) ? v : null } catch { return null }
}
export const readSceneDrawMode = (scene: string | null, fallback: DrawMode = 'depth'): DrawMode => readExplicitDrawMode(scene) ?? fallback

/** the quiet nudge shown while the scene has no approved first frame (owner's words only) */
export const DRAW_NUDGE = 'Draw one frame of the whole scene and pick it first. Your other angles will match it.'

/** POST /__lab/hero/look (free): the approved first frame `stillId` of take `takeId` becomes the scene's look; rejects with the server's words */
export async function postLook(takeId: string, stillId: string): Promise<void> {
  const res = await fetch(HERO_LOOK_ROUTE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ takeId, stillId }) })
  if (res.ok) return
  const b = await res.json().catch(() => null) as { error?: string } | null
  throw new Error(b?.error ?? `the frame could not be set as the look (${res.status})`)
}

/** the one-line cue under the switch in From approved frame: what the mode takes (and that it can copy more) and what a redraw costs */
export const drawModeCue = (seedCredits: number, hasPlate: boolean, count: 1 | 2 = 1) =>
  `Takes the clothes and the place from the approved frame, and can copy other things from it too; about ${seedCredits} cr a redraw${hasPlate ? '' : ' after the first'}${count === 2 ? '. Two options are drawn each time.' : '.'}`

/** the cue in From words: nothing comes from the approved frame unless the owner asks */
export const DEPTH_CUE = 'Draws from your words and the 3D set; nothing is taken from the approved frame unless you choose it.'

/**
 * Whether a scene with an approved look frame opens in From approved frame when the owner has not chosen. Orchestrator's decision
 * for the stage-only fix pass (review F2), 2026-10-29: false, so every scene opens in From words. It supersedes the 10-27
 * "default to the approved frame once a look exists" decision: the owner's 10-28 reports (a car copied out of a wide approved frame
 * into a close-up that framed none) and the owner's drop of the cross-angle consistency claim. Flip to true to bring that back.
 */
export const APPROVED_FRAME_DEFAULT = false

/** the scene's chosen mode and its setter; `chosen` is what the preview is asked for, `model` is what the row shows */
export function useDrawMode(scene: string | null) {
  // the owner's explicit choice wins; without one: From words (APPROVED_FRAME_DEFAULT; the look frame is seen on the press preview)
  const [s, setS] = useState(() => ({ scene, mode: readExplicitDrawMode(scene) }))
  const [seen, setSeen] = useState<{ scene: string | null; look: boolean }>({ scene, look: false })
  const explicit = s.scene === scene ? s.mode : readExplicitDrawMode(scene)
  const chosen: DrawMode = scene === null ? 'depth' : explicit ?? (APPROVED_FRAME_DEFAULT && seen.scene === scene && seen.look ? 'edit' : 'depth')
  const setMode = (m: DrawMode) => { setS({ scene, mode: m }); try { localStorage.setItem(`${KEY}.${scene ?? ''}`, m) } catch { /* storage off: this page only */ } }
  const edit = (pv: StillPreviewResponse | null | undefined) => (pv?.edit?.available && pv.edit.lookUrl ? pv.edit : null)
  return {
    chosen,
    /** tell the hook what the press preview says about the look frame, so the default can flip (call from an effect) */
    observe: (pv: StillPreviewResponse | null | undefined) => {
      if (!pv) return
      const look = !!edit(pv)
      if (seen.scene !== scene || seen.look !== look) setSeen({ scene, look })
    },
    /** the mode a press sends: the chosen one, but depth while there is no look frame to draw from */
    effective: (pv: StillPreviewResponse | null | undefined): DrawMode => (chosen === 'edit' && edit(pv) ? 'edit' : 'depth'),
    /** the press's price in edit mode (the preview's, for the stills asked for), else null: the caller's own */
    price: (pv: StillPreviewResponse | null | undefined): number | null => (chosen === 'edit' && edit(pv) ? edit(pv)!.price : null),
    /** one still's price in edit mode (a redraw of one seed: its edit and finish, plus the plate while the take has none), else null: the caller's own */
    price1: (pv: StillPreviewResponse | null | undefined): number | null => (chosen === 'edit' && edit(pv) ? edit(pv)!.seedCredits + (edit(pv)!.hasPlate ? 0 : edit(pv)!.plateCredits) : null),
    /** the quiet nudge: the preview is in and the scene has no approved frame to draw from */
    nudge: (pv: StillPreviewResponse | null | undefined): boolean => scene !== null && !!pv && !edit(pv),
    /** the row's model; null (no row) while the preview has no look frame */
    model: (pv: StillPreviewResponse | null | undefined, count: 1 | 2 = 1): HeroDrawModeModel | null => {
      const e = edit(pv)
      return e ? { mode: chosen, onMode: setMode, lookUrl: e.lookUrl!, stale: e.stale ?? null, cue: chosen === 'edit' ? drawModeCue(e.seedCredits, e.hasPlate, count) : DEPTH_CUE, onUseLook: postLook } : null
    },
  }
}

import { useSyncExternalStore } from 'react'
import type { KitStill } from '../../../server/hero/kitSpec'
import type { DrawMode, StillPreviewResponse } from '../../shared/stillPressContract'
import type { PressChoice } from './useStillPreview'

/** what the press preview read and the lock/refs choice the press will send (the block holds the state) */
export interface HeroPromptModel {
  kit: boolean
  preview: StillPreviewResponse | null
  choice: PressChoice
  disabled: boolean
}

/** the take's first frame: its approved opening still, else the newest opening still nobody has approved (shown for approval) */
export interface HeroOverlayModel {
  still: KitStill & { stale: boolean }
  /** the still is the take's approved first frame (nothing awaits approval) */
  approved: boolean
  /** what a Redraw costs; null while the press is gated (another set, the 3D set frames not ready) */
  redrawPrice: number | null
  running: boolean
  error: string | null
  onApprove: (id: string) => void | Promise<void>
  onRedraw: () => void
  /** a Keep on the still made a newer one: read the stills again */
  onChanged: () => void
  /** (consistency pass) a press that brought two stills: their ids in draw order, space-separated ('' = one, nothing to pick; a
   *  string so a re-publish that changed nothing wakes nobody); `still` is the one shown, and `onShow` shows another */
  choices?: string
  onShow?: (id: string) => void
}

/**
 * The priced "Draw this frame" press the Stage's draw bar shows in the block's place (merge step 7): the block owns the recipe
 * (the stills per press, the keyframe, the prompt) and the press's closure; the bar renders the button and the running pill.
 * Null while the block is gone (no locked take, another panel picked): the bar shows no press then, exactly as the block didn't.
 */
export interface HeroPressModel {
  price: number
  /** the paid draw runs (here or another page's): the pill, not the press */
  drawing: boolean
  /** what the pill names (the block's phase), null when nothing runs */
  phase: string | null
  /** the job's start, the pill's clock (null when nothing runs) */
  since: number | null
  /** why the press is off, exactly the block's gate: the button greys with this as its title */
  gate: string | null
  /** the resolved button title: the gate, or what the press does */
  title: string
  disabled: boolean
  onPress: () => void
  /** the last press's failure in plain words (the frames could not be prepared, a refusal); pressing again retries */
  error?: string | null
  /** the still is in while the job still finishes in the background: said quietly, the press stays off until it ends */
  note?: string | null
  /** a paid draw that never came back (its job id known): fetch it by id, free, never a new job; null when none */
  onRecover?: (() => void) | null
  /** drawn stills whose last step never ran: run only that step on them (its own small price), never a new draw; null when none */
  finish?: { count: number; price: number; onFinish: () => void } | null
  /** (consistency pass, the Stage) stills per press, 1 or 2, remembered for the scene; `price` is that count's */
  stills?: number
  onStills?: (n: number) => void
  /** (the Stage) another take of this scene has an approved first frame: while `on` (off by default) the press takes its clothes and its seed */
  sameLook?: { on: boolean; onToggle: () => void } | null
  /** (draw-from-master, the Stage) the first frame's draw mode; null while the scene has no look frame to draw from */
  drawMode?: HeroDrawModeModel | null
  /** (the Stage) true while the scene has no approved first frame: the plain "draw and approve one first" nudge shows */
  drawNudge?: boolean
  /** (no-person shots) no one plays the person and none is in view: the soft note (NOBODY_IN_SHOT); the press still draws */
  nobody?: string | null
  /** the take's frames show the set as it was before a piece was built or moved (SET_BEHIND): the press prepares them again first */
  setBehind?: string | null
}

/** the quiet row under "Draw the first frame": the two-way switch, the look frame, its cue, and the free "use as the look" button */
export interface HeroDrawModeModel {
  mode: DrawMode
  onMode: (m: DrawMode) => void
  /** the approved frame the draw would take from (public path) */
  lookUrl: string
  /** set when the frame the owner picked is gone and the first approved frame is used instead */
  stale: string | null
  cue: string
  /** free: makes the approved first frame `stillId` of take `takeId` the scene's look */
  onUseLook: (takeId: string, stillId: string) => Promise<void>
}

export interface HeroPublished { prompt: HeroPromptModel; overlay: HeroOverlayModel | null; press: HeroPressModel | null }

/**
 * A tiny store between the shoot panel's hero block (which owns the press: the take, the stills, the prompt) and the places
 * that show parts of it elsewhere: the viewport's overlay and the Stage draw bar's press. The block publishes while it is
 * mounted and clears on unmount; callers hold no hero state of their own. Models are compared shallowly so a render of the
 * block that changed nothing wakes nobody.
 */
let current: HeroPublished | null = null
const listeners = new Set<() => void>()

const same = (a: object | null, b: object | null): boolean => {
  if (a === b) return true
  if (!a || !b) return false
  const ka = Object.keys(a) as (keyof typeof a)[]
  return ka.length === Object.keys(b).length && ka.every((k) => Object.is(a[k], (b as typeof a)[k]))
}

export function publishHero(next: HeroPublished | null): void {
  if (next && current && same(next.prompt, current.prompt) && same(next.overlay, current.overlay) && same(next.press, current.press)) return
  current = next
  listeners.forEach((l) => l())
}

export function useHeroPublished(): HeroPublished | null {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => current)
}

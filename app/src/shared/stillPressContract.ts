/**
 * (recipe wave, 2026-10-24) The hero still's press preview: everything a "Draw this frame" press would send, composed by the
 * server with no Cloud call (server/hero/preview.ts), so the owner sees the prompt, the depth lock, the material references, the
 * seeds and the price before paying. Shoot's StillPreview card reads it; the press then sends the same fields to POST /__lab/hero.
 * Pure types and the route; fields are only ever added.
 */
import type { KeyframeRole } from './shotContract.ts'

/** (prompt wave) one warn-only note about a prompt: shown under the field, never blocks and never rewrites the text */
export interface PromptWarning { code: string; message: string }

/** POST: free, never submits a job; same refusals as the press for a bad take, tag or role */
export const STILL_PREVIEW_ROUTE = '/__lab/hero/preview'

/** how hard the still is held to the 3D set's depth: named presets, numbers only in tooltips (server/hero/lockPresets.ts) */
export const LOCK_PRESET_IDS = ['photographic', 'tight'] as const
export type LockPresetId = (typeof LOCK_PRESET_IDS)[number]
export const isLockPreset = (v: unknown): v is LockPresetId => typeof v === 'string' && (LOCK_PRESET_IDS as readonly string[]).includes(v)

/** (draw-from-master) how the first frame is drawn: 'depth' = from words and the set's depth (today's press, the default),
 *  'edit' = from the scene's approved look frame (server/hero/kitRunEdit.ts),
 *  'edit-projected' = the same edit, but on the approved master seen from this camera by its depth (no plate; API only). Absent = depth. */
export const DRAW_MODES = ['depth', 'edit', 'edit-projected'] as const
export type DrawMode = (typeof DRAW_MODES)[number]
export const isDrawMode = (v: unknown): v is DrawMode => typeof v === 'string' && (DRAW_MODES as readonly string[]).includes(v)

export interface StillPreviewRequest {
  takeId: string
  /** absent = 'depth' */
  mode?: DrawMode
  role?: KeyframeRole
  frame?: number
  preset?: LockPresetId
  /** Bible tags to send as material references; absent = the default (visible board pieces, then materials); [] = none */
  materials?: string[]
  count?: number
  /** the owner's edited prompt; absent = the composed one */
  prompt?: string
  /** (owner 10-29) the finish's words as edited; absent = the composed card */
  finishPrompt?: string
  /** (prompt-fix pass) the draw words the app adds, each switched off per take with `false`; absent = all on */
  drawAdds?: Partial<Record<DrawAddKey, boolean>>
  /** (stage-only) true = the finish takes the clothes from the scene's approved look frame, as the press would; absent = the card's */
  sameLook?: boolean
}

/** one approved board tile the press can send to the finish as a material reference */
export interface StillRefChip { tag: string; kind: 'prop' | 'material'; url: string; label: string; sent: boolean }

export interface StillPreviewResponse {
  role: KeyframeRole
  frame: number
  /** what the draw would send: the edited text as written, else the composed prompt */
  prompt: string
  /** the recipe's composed prompt (the textarea's default) */
  composed: string
  /** true when `prompt` is the owner's text */
  edited: boolean
  preset: LockPresetId
  count: number
  /** credits the press shows on its button (draw + finish, every seed) */
  price: number
  /** every board tile the press could send; `sent` = goes with this press */
  refs: StillRefChip[]
  /** the depth image the draw is held to (public URL, cache-busted), null when the frame has no depth yet */
  depthUrl: string | null
  /** (prompt wave) warn-only checks on the text that goes; absent from an older server */
  warnings?: PromptWarning[]
  /** (prompt wave) the Klein finish's prompt for this press, read-only; editing it is deferred */
  finishPrompt?: string
  /** (prompt wave) the face redraw's prompt shape ("Redraw face from card"), read-only */
  faceRedrawPrompt?: string
  /** (stage-only) the approved look frame the finish takes its clothes from (image 3) on THIS request: only when it asked for it
   *  (`sameLook: true`) or draws from the approved frame; null otherwise (the card's own picture goes) */
  sameLook?: LookFrame | null
  /** (stage-only) the approved first frame of another take of this scene and cast a press COULD take the clothes and seed from (the
   *  Stage offers the choice only when there is one); null when there is none; absent from an older server */
  lookFrame?: LookFrame | null
  /** (draw-from-master) the mode `price` is for (absent from an older server = 'depth') */
  mode?: DrawMode
  /** (draw-from-master) the "from your approved frame" draw, always answered for a kit take so the Stage can show it and its price */
  edit?: EditPreview
  /** (no-person shots) no one plays the person and they are not in this frame: the draw goes with no person in it (NOBODY_IN_SHOT) */
  nobody?: boolean
  /** (owner 10-29) every paid job this press sends, in order, with its exact text, from the press's own composer ("What will be
   *  sent"); absent from an older server */
  sent?: SentJob[]
}

/** one paid job of a press and the exact words it sends; `negative` absent = the model takes none (or ignores it) */
export interface SentJob { what: string; prompt: string; negative?: string
  /** (owner 10-29) the words the app composed for this job (what Reset goes back to); absent = the same as `prompt` */
  composed?: string
  /** (owner 10-29) the request field an edit of this job's words travels in, sent as written; absent = not editable here */
  edit?: 'prompt' | 'finishPrompt'
  /** (prompt-fix pass) the negative in English and where it comes from, shown beside it (never sent) */
  negativeEnglish?: string; negativeSource?: string
  /** (prompt-fix pass) the words the app adds to this job, each with its switch: `on` = in the words above */
  added?: AppAddition[] }

/** the draw words the app adds that a take can switch off: the cast card's later sentences, the pieces in view and the cut top */
export type DrawAddKey = 'castRest' | 'frameTail'
/** one "Added by the app" line: its key, the words it adds, whether they go */
export interface AppAddition { key: DrawAddKey; text: string; on: boolean }
/** what each addition is, said beside its switch */
export const DRAW_ADD_LABELS: Record<DrawAddKey, string> = { castRest: "The rest of the person's card", frameTail: 'The pieces in view' }

/** the soft note beside "Draw the first frame" when no one plays the person and the shot has none in view (a tyre close-up) */
export const NOBODY_IN_SHOT = 'No person is in this shot: the frame is drawn without one. To add one, pick The subject and press Plays the subject.'

/** an approved first frame of another take (server/hero/sameLook.ts): its picture, its seed, and how it was chosen */
export interface LookFrame { seed: number; png: string; takeId?: string; stillId?: string; source?: 'pointer' | 'oldest'; stale?: string }

/** what "Draw from your approved frame" would do for this take and frame, composed for free (server/hero/preview.ts) */
export interface EditPreview {
  /** false = the press would be refused for want of a look frame; `why` says it in plain words */
  available: boolean
  why: string | null
  /** the approved frame it takes the clothes and the place from (public path), null when there is none */
  lookUrl: string | null
  /** set when the frame the owner picked as the scene's look no longer holds and the first approved frame is used instead (plain words) */
  stale?: string | null
  /** the empty-set drawing already made for this take and start (public path, cache-busted), null until the first press */
  plateUrl: string | null
  hasPlate: boolean
  /** credits the press shows with `count` seeds: the plate only when there is none yet, then the edit and the finish a seed */
  price: number
  /** the parts of that price: the plate (charged once per take and start) and each seed's edit plus finish */
  plateCredits: number
  seedCredits: number
}

/** (draw-from-master) POST, free: makes an approved first frame the scene's look. Body { takeId, stillId } (the take that owns the frame) */
export const HERO_LOOK_ROUTE = '/__lab/hero/look'

/** (tidy wave) POST, free: what "Draw the look" would send (server/bible/masterPreview.ts); same refusals as the draw's compose */
export const MASTER_PREVIEW_ROUTE = '/__lab/bible/master/preview'
export interface MasterPreviewRequest { worldId: string; preset?: LockPresetId; prompt?: string; count?: number }
export interface MasterPreviewResponse {
  /** what the draw would send: the edited text as written, else the composed prompt */
  prompt: string
  composed: string
  edited: boolean
  preset: LockPresetId
  count: number
  price: number
  /** the master view's depth as the draw is held to it (cache-busted), null until the set's master depth is measured */
  depthUrl: string | null
  /** (prompt wave) warn-only checks on the text that goes; absent from an older server */
  warnings?: PromptWarning[]
}

/**
 * Bible contract (Wave 0.5, docs/preproduction-plan-fable.md §3.1): one scene Bible per kit world, kept inside the world's
 * location folder so every `loc-` check, the manifest and the lock identity keep working. Track A1 builds the store, the routes
 * and composePrompt (server/bible/), A2 the Scene screen over them; B and C call composePrompt. Every track imports these types,
 * routes and paths from here; nobody redefines them. Fields are only ever added. Pure (no DOM, no node).
 */
import type { ScenePlan } from '../stage3d/contract.ts'
import type { BriefLight, SceneBriefV2 } from './briefContract.ts'
import type { SetApproval } from './setApproval.ts'
export type { BriefAtmosphere, BriefBeat, BriefCamera, BriefElementV2, BriefLight, BriefPlace, SceneBriefV2 } from './briefContract.ts'

/** What a reference tile is. A cast or creature element points at a Cast card; the rest carry their own refs. */
export const ELEMENT_KINDS = ['cast', 'creature', 'extras', 'prop', 'material'] as const
export type ElementKind = (typeof ELEMENT_KINDS)[number]

/** A tag's word, stored without the '@': a lower-case letter, then letters, digits, '_' and '-', 32 at most. The one source of
 *  the tag rule (m15): every tag check, here and in the server's tracks, is built from it. */
export const TAG_WORD = '[a-z][a-z0-9_-]{0,31}'
/** a whole string that is a tag (no '@') */
export const TAG_RE = new RegExp(`^${TAG_WORD}$`)
export const isTag = (t: unknown): t is string => typeof t === 'string' && TAG_RE.test(t)
/** A tag in a scene prompt: '@' (not inside a word, so no e-mail address) + the tag's word. */
export const BIBLE_TAG_RE = new RegExp(`(?<![A-Za-z0-9_])@(${TAG_WORD})\\b`, 'g')
/** Every @mention in a text replaced (by default with its bare word): what a model reads where a tag means its words. */
export const untag = (text: string, as: (tag: string) => string = (t) => t) => text.replace(/@([a-z][a-z0-9_-]*)/g, (_m, t: string) => as(t))

/** One reference tile and the tag that names it. */
export interface BibleElement {
  /** unique within the Bible, without the '@' */
  tag: string
  kind: ElementKind
  /** cast and creature: the Cast card (server/cast CARD_ID_RE) */
  cardId?: string
  /** the reference images this tag resolves to: public URLs (copies under bible/elements/ or /lab-assets URLs) */
  refs: string[]
  /** what a prompt says when the tag is mentioned (cast tags expand from the card instead, see ComposeInput) */
  line: string
}

/** credits for one Qwen-Image 2512 image at 50 steps (E16, E130 ledgers): a master candidate, a kit still's draw, a full concept.
 *  The one copy (m15); every price that is "one Qwen 2512 picture" reads it. */
export const QWEN_2512_CR = 14
/** one Qwen 2512 picture locked to depth through the Fun ControlNet (master candidates, kit still draws): bills 17–18 cr each
 *  (bible-master ledger rows 10/23–10/24), so priced at the top of that */
export const QWEN_DEPTH_CR = 18

/** A drawn master: the clay master view drawn depth-locked (Qwen-Image 2512 + depth patch). Never overwritten. */
export interface BibleMaster {
  id: string
  /** public path, 1920x1088 (upscaled from the model's size) */
  png: string
  /** the model or graph that drew it, e.g. 'qwen-image-2512+depth' */
  madeBy: string
  seed: number
  /** the depth patch strength, 0..1 */
  depthStrength: number
  jobId: string | null
  credits: number
  createdAt: string
}

/** One image of 6-8 extras variants on black; an extra's `variant` indexes it (0-based, left to right). */
export interface BibleExtrasSheet { png: string; variants: number }

/** What the finish grades a take to. */
export interface BibleGrade { target: string; method: 'reinhard-lab' }

/** bible.json. A change to the prompt, a line, the master or an element writes the next version; takes and stills record it. */
export interface BibleRecord {
  /** the kit world (location id, `loc-…`) */
  worldId: string
  /** 1, 2, 3…: append-only, like Cast card versions */
  version: number
  /** the scene prompt, tags written as @tag tokens; '' = none yet (the kit plan's sentence stands in) */
  prompt: string
  /** the approved master, null until one is approved */
  master: BibleMaster | null
  /** every master drawn, approved or not */
  candidates: BibleMaster[]
  /** one sentence each, into every drawn still and the Render prompt; '' = none */
  lighting: string
  materials: string
  /** (S2, optional: old Bibles have none) the background ACTION line: people and motion far behind the hero, e.g. "soldiers
   *  fighting and running in the smoke far behind him" (E131: the far crowd comes from the words alone). Into still and Render
   *  prompts; never background geometry (E130). '' / absent = none */
  background?: string
  /** (prompt wave, optional: old Bibles have none) the structured scene brief the prompts are written from; when it is saved,
   *  `lighting`, `materials` and `background` are derived from it unless the same save writes them (server/bible/briefLines.ts) */
  brief?: SceneBriefV2
  elements: BibleElement[]
  extrasSheet: BibleExtrasSheet | null
  grade: BibleGrade | null
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------- composePrompt (track A1, server/bible/prompt.ts)

export type PromptTarget = 'still' | 'video'

export interface ComposeInput {
  /** null = the world has no Bible yet: the fallback and the action only */
  bible: BibleRecord | null
  target: PromptTarget
  /** the kit plan's sentence (ScenePlan.sentence): stands in for a Bible with no prompt yet (old worlds) */
  fallback?: string | null
  /** the take's action line (TakeRecord.action) */
  action?: string | null
  /** still prompts: the 1-based image slot each cast tag's reference is sent in ("the person from image N") */
  imageSlots?: Record<string, number>
  /** video prompts: a Cast card's description by card id (a cast tag expands to it) */
  castDescriptions?: Record<string, string>
}

export interface ComposedPrompt {
  /** the prompt to send, before the hero / L2R scrub (the camera line is never in it; the hero graph adds its own) */
  text: string
  /** tags expanded, in order of first mention */
  tags: string[]
  /** @tokens matching no element: flagged in the composer and never sent */
  unknown: string[]
}

/** server/bible/prompt.ts exports `composePrompt` with this signature; B (hero) and C (l2r) call it by that name. */
export type ComposePrompt = (input: ComposeInput) => ComposedPrompt

/** The tags a prompt mentions, without the '@', in order of first mention. */
export function promptTags(prompt: string): string[] {
  const seen: string[] = []
  for (const m of prompt.matchAll(BIBLE_TAG_RE)) if (!seen.includes(m[1])) seen.push(m[1])
  return seen
}

// ---------------------------------------------------------------- routes (track A1; a 501 stub until then)

export const BIBLE_ROUTES = { bible: '/__lab/bible' } as const

/**
 * GET  /__lab/bible?world=<loc-…>        -> BibleResponse (bible null = none yet)
 * POST /__lab/bible                       BibleSaveRequest -> BibleResponse (the next version)
 * POST /__lab/bible/master                BibleMasterRequest -> BibleResponse (paid: candidates appended)
 * POST /__lab/bible/approve               BibleApproveRequest -> BibleResponse
 * POST /__lab/bible/set/approve           {worldId} -> BibleResponse (free: approves the set at its current key; 409 with no set)
 * POST /__lab/bible/element               BibleElementRequest -> BibleResponse (upsert by tag)
 * POST /__lab/bible/element/remove        BibleElementRemoveRequest -> BibleResponse
 * POST /__lab/bible/check                 BibleCheckRequest -> BibleCheckResponse (free, no world, writes nothing)
 */
export interface BibleResponse {
  bible: BibleRecord | null
  /** a paid master draw in flight */
  running?: { since: string; what: string } | null
  /** (GET) billed master jobs whose candidates never landed (a restart mid-draw): recover by id, free (POST /__lab/jobs/recover) */
  unrecovered?: BibleUnrecovered[]
  /** (guided wave; GET and the set approval's reply) the set the owner approved, at its set key; null = never. Kept beside the sheet, not in it, so approving never makes a take or a still "behind the Bible" (setApproval.ts) */
  setApproval?: SetApproval | null
  /** (guided wave; with setApproval) the set's key now, the one Shoot computes: approved = the approval's key is this one; null = no set */
  setKey?: string | null
  /** (review F1; with setApproval) every set key ever approved on the world, so a locked take's own set reads approved by its key */
  setKeys?: string[]
}
export interface BibleUnrecovered { jobId: string; ids: string[]; since: string }
/** a whole design as Build the set would write it, checked before the paid plan (wave 3 M1) */
export interface BibleCheckRequest extends Omit<BibleSaveRequest, 'worldId'> { elements: BibleElement[] }
export interface BibleCheckResponse { ok: boolean; errors: string[] }
export interface BibleSaveRequest { worldId: string; prompt?: string; lighting?: string; materials?: string; extrasSheet?: BibleExtrasSheet | null; background?: string; /** the v2 brief (null removes it) */ brief?: SceneBriefV2 | null }
export interface BibleMasterRequest {
  worldId: string
  /** 1..2 seeds in one job (default 2) */
  count?: number
  seed?: number
  depthStrength?: number
  /** (tidy wave) the lock preset (stillPressContract LockPresetId); absent = 'photographic', the recipe's; beats depthStrength */
  preset?: 'photographic' | 'tight'
  /** (tidy wave) the owner's edited prompt from the master's press preview; absent = the composed one */
  prompt?: string
}
export interface BibleApproveRequest { worldId: string; masterId: string }
export interface BibleElementRequest { worldId: string; element: BibleElement }
export interface BibleElementRemoveRequest { worldId: string; tag: string }

// ---------------------------------------------------------------- disk layout

/** under the app's public/: lab-assets/locations/<loc-…>/bible/{bible.json, master/<id>.png, elements/…} */
export const biblePaths = (worldId: string) => {
  const root = `lab-assets/locations/${worldId}/bible`
  return { root, file: `${root}/bible.json`, master: `${root}/master`, elements: `${root}/elements` }
}

// ---------------------------------------------------------------- the scene planner and "Develop with AI" (S2, server/planner/)
// Gemma 4 E4B on Comfy Cloud (core TextGenerate). Paid: each call is one job (shown 4 cr cold; a batch of plans 3 + 1 per plan), plus
// at most one retry job for answers that failed validation. Nothing here writes the Bible: Scene applies a brief with the
// routes above (POST /__lab/bible for prompt / lighting / materials / background, /element per element).

export const PLANNER_ROUTES = { planner: '/__lab/planner' } as const
/** credits: a job loads Gemma cold and pays per answer (server/priceBasis.ts): one lone call shows 4 (billed 0.8-3.6 across the last 19), a batch of n plans 3 + n */
export const PLANNER_CR = { cold: 3, perItem: 1 } as const
export const plannerCredits = (n: number) => PLANNER_CR.cold + PLANNER_CR.perItem * Math.max(1, n)
/**
 * GET  /__lab/planner                 -> PlannerStatus (prices, a call in flight, billed runs to recover)
 * GET  /__lab/planner/run?id=<runId>  -> the stored PlanResponse | DevelopResponse | FleshResponse (completes a recovered run, free)
 * POST /__lab/planner/plan            PlanRequest -> PlanResponse (paid)
 * POST /__lab/planner/develop         DevelopRequest -> DevelopResponse (paid)
 * POST /__lab/planner/flesh           FleshRequest -> FleshResponse (paid)
 * Refusals before any spend: 400 bad input, 409 busy, 429 day budget, 503 no Comfy target. 422 = billed but still invalid after
 * the retry (body carries `errors`, `runId`, `jobIds`). A 502 carrying `jobId` = recover by id (POST /__lab/jobs/recover), never resend.
 */
export type BriefElementType = 'person' | 'creature' | 'group' | 'prop'
/** the Bible element kind a brief element becomes (person -> cast, group -> extras) */
export const BRIEF_KIND: Record<BriefElementType, ElementKind> = { person: 'cast', creature: 'creature', group: 'extras', prop: 'prop' }
export interface BriefElement { name: string; tag: string; type: BriefElementType; look: string; supported: boolean }
/** something the motion library / kit cannot do (horses and riders, water, vehicles, animals but the dragon), and its swap */
export interface BriefWarning { element: string; issue: string; swap: string }
/** how a warning about a detail of the idea the brief dropped begins (server/planner/mustKeep.ts); its words are not in the brief */
export const BRIEF_LEFT_OUT = 'your idea has this, but the brief left it out: add it back, or press Develop again'
export interface SceneBrief {
  /** the developed scene, @tags for every element */
  brief: string
  elements: BriefElement[]
  lighting: string
  materials: string
  /** the background action line (BibleRecord.background); '' = none */
  background: string
  /** 3 or 4 */
  beats: string[]
  warnings: BriefWarning[]
  /** (prompt wave) the structured v2 brief the flat lines above were derived from; absent from an older server */
  v2?: SceneBriefV2
}
export type DevelopMode = 'light' | 'full'
export interface PlanRequest { /** 1..8 scene sentences, one job */ prompts: string[]; seed?: number; /** the brief's key light: the plan's light comes from it (planLight.ts) */ light?: BriefLight | null }
export interface DevelopRequest { idea: string; mode: DevelopMode; seed?: number }
export interface FleshRequest { name: string; description: string; /** the scene brief, for context */ scene?: string; seed?: number }

export interface PlannedScene {
  prompt: string
  /** a plan that passes parsePlan (first try, after the retry, or repaired); null = none */
  plan: ScenePlan | null
  /** clamped / moved by repairPlan after the retry also failed (see notes) */
  repaired: boolean
  notes: string[]
  /** the validator's errors on the last answer ([] when it passed) */
  errors: string[]
  attempts: number
}
export interface PlannerRunBase {
  runId: string; jobIds: string[]; /** measured, summed over the jobs (null = not measured) */ credits: number | null; createdAt: string
  /** every job of the press that Cloud saw, measured or at its estimate: what the day budget and the scene's job record hold, and
   *  what a 422 (billed, still invalid after the retry: two jobs) must be counted as. Always set by the server. */
  spentCredits?: number
  /** (422 only) the validator's errors on the last answer */
  errors?: string[]
  /** the retry job was refused before any spend (e.g. the day budget): the first answers stand */
  retryRefused?: string
  /** the internal retry ran (a second billed job for one press), whether or not it fixed the answer (server/planner/finalize.ts) */
  retried?: boolean
  /** what the retry alone cost, measured; null when not measured (count the press's estimate again) */
  retryCredits?: number | null
}
/** the credits a planner answer's internal retry added on top of the press's estimate (0 when no retry ran) */
export const retryCost = (r: unknown, estimate: number): number => {
  const x = r as Partial<PlannerRunBase> | null | undefined
  return x?.retried ? (typeof x.retryCredits === 'number' ? x.retryCredits : estimate) : 0
}
/** the line a press whose planner had to try again shows beside its spend */
export const retryLine = (n: number) => `The planner had to try again (retry, +${Math.round(n * 10) / 10} cr, in the spend).`
export interface PlanResponse extends PlannerRunBase { kind: 'plan'; scenes: PlannedScene[] }
export interface DevelopResponse extends PlannerRunBase { kind: 'develop'; mode: DevelopMode; idea: string; /** null only on a 422 */ brief: SceneBrief | null; attempts: number }
export interface FleshResponse extends PlannerRunBase { kind: 'flesh'; name: string; description: string; warnings: BriefWarning[]; attempts: number }
export type PlannerResponse = PlanResponse | DevelopResponse | FleshResponse

export interface PlannerPrices {
  /** a single plan, brief or flesh-out (the model loads cold every job) */
  single: number
  /** a batch of n plans costs about cold + n * perItem */
  cold: number
  perItem: number
  /** a failed answer costs one more job of the same size */
  retry: string
}
export interface PlannerStatus {
  prices: PlannerPrices
  running: { since: string; what: string } | null
  /** billed planner jobs whose answers never landed: recover by id (free), then GET /run?id= */
  unrecovered: { jobId: string; runId: string; since: string }[]
  /** today's spending limit as the runner holds it (a local read, no Cloud call): cap null = not set (every paid press is refused),
   *  remaining null with it; a press whose price is above `remaining` is refused with 429 before any spend */
  budget?: { cap: number | null; remaining: number | null }
}

type BibleNow = (Pick<BibleRecord, 'version'> & Partial<Pick<BibleRecord, 'master'>>) | null
/**
 * True when a take or still is behind the world's Bible: it recorded an older version, or (m5, owner's call) it recorded none
 * (made while the world had no Bible) and the Bible now has an approved master. A world with no Bible is never behind.
 */
export function bibleMoved(recorded: number | undefined, bible: BibleNow): boolean {
  if (!bible) return false
  return recorded === undefined ? !!bible.master : recorded !== bible.version
}
/** How it is behind, to follow "drawn" / "locked" in a message ("drawn against Bible version 2; …"); null when it is not. */
export function bibleMovedWhy(recorded: number | undefined, bible: BibleNow): string | null {
  if (!bibleMoved(recorded, bible)) return null
  return recorded === undefined
    ? `before the scene had its sheet; the sheet now has an approved master (version ${bible!.version})`
    : `against scene sheet version ${recorded}; the scene is on version ${bible!.version} now`
}

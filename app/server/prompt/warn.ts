/**
 * Warn-only prompt checks (prompt wave, Track E; plan section 5). A user-pasted or hand-edited prompt is NEVER rewritten or blocked:
 * these only tell the user, in plain words, what is likely to hurt the draw. Eight checks, no more (the rest wait for a false-positive
 * rate). The same function reads an app-filled prompt, which must come out clean when it was built from a clean brief.
 *
 *   code           still master klein render window
 *   length           x     x      x     x      x
 *   negation         x     x      x     x      x
 *   quality          x     x      x     x      x
 *   style            x     x      x     x      x
 *   fire-grain       (pasted text only, every step)
 *   action           x                  x      x
 *   atmosphere       x     x            x
 *   pipeline-words                      x      x
 */
import type { SceneBriefV2 } from '../../src/shared/briefContract.ts'
import { bannedIn, GRAIN } from './banned.ts'

export type WarnStep = 'still' | 'master' | 'klein' | 'render' | 'window'
export type WarnCode = 'length' | 'negation' | 'quality' | 'style' | 'fire-grain' | 'action' | 'atmosphere' | 'pipeline-words'
export interface PromptWarning { code: WarnCode; message: string }
export interface WarnOpts {
  step: WarnStep
  /** the scene brief, when the scene has one (a string or an older shape is ignored) */
  brief?: unknown
  /** the take's action, typed at Lock */
  take?: { action?: string }
  /** the text is the user's own (pasted or edited), not the app's */
  pasted?: boolean
}

const WORDS = (t: string) => t.split(/\s+/).filter(Boolean)
const SENTENCES = (t: string) => t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
const uniq = (a: string[]) => [...new Set(a.map((x) => x.toLowerCase()))]

const NEGATION = /\b(no|not|without|never|nothing|none|avoid|don't|do not|doesn't|isn't|aren't|free of|absent)\b/gi
const QUALITY = /\b(4k|8k|uhd|hdr|masterpiece|hyper-?realistic|ultra-?(?:detailed|realistic)|highly detailed|best quality|octane(?: render)?|trending on artstation|award[- ]winning)\b/gi
const STYLE = /\b(kodak|fuji(?:film)?|portra|ektachrome|cinestill|ilford|tri-x|vision3|250d|500t|\d+ ?mm|golden hour|cinematic|film grain|weathered|aged|rusted|rusty|worn)\b/gi
const PIPELINE = /\b(clay|3d|unreal|render(?:ed|ing|s)?|reference image|the still)\b/gi

const STOP = new Set(['the', 'and', 'with', 'from', 'into', 'then', 'that', 'this', 'they', 'their', 'them', 'performer', 'person', 'hero', 'while', 'over', 'back', 'out', 'along'])
/** content words as 4-letter stems, so "looks" matches "looking" */
const stems = (t: string) => uniq(WORDS(t.toLowerCase().replace(/[^a-z\s'-]/g, ' ')).filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.slice(0, 4)))

const hits = (re: RegExp, text: string): string[] => uniq(text.match(re) ?? [])
const quote = (a: string[]) => a.slice(0, 4).map((w) => `"${w}"`).join(', ')

/** the v2 brief off a Bible record (BibleRecord.brief; anything that is not an object reads as no brief) */
export function briefFromBible(bible: unknown): SceneBriefV2 | undefined {
  const c = (bible as { brief?: unknown } | null | undefined)?.brief
  return c && typeof c === 'object' && !Array.isArray(c) ? (c as SceneBriefV2) : undefined
}

function briefOf(b: unknown): Partial<SceneBriefV2> | null {
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Partial<SceneBriefV2>) : null
}

/** lines an older default prompt carried ("Match the first frame: …", "Keep the same … as the driver.", "Photoreal."): pasted back
 *  by hand they are the card's shape, not sentences of what happens, so they never count toward the sentence limit */
const CARD_LINES = [/^Match the first frame\b/, /^Keep the same\b.*\bas the driver[.!]?$/, /^Photoreal[.!]?$/]
/** the render's length guideline in words: the L2R card asks for short prompts, so the default keeps under it (stagedWords.ts
 *  sends each card as its first sentence when the whole cards would pass it) */
export const RENDER_WORDS = 120
/** sentences of what happens before the warning speaks: one or two of action and a plain look sentence (owner 10-29: the look is
 *  its own sentence now that "Match the first frame:" is gone) */
const RENDER_SENTENCES = 3

function renderLength(text: string, brief: unknown): string | null {
  const w = WORDS(text).length
  const told = SENTENCES(text).filter((s) => !CARD_LINES.some((re) => re.test(s))).length
  // the brief's own style line goes last as written; its sentences are the user's look, not more story
  const style = String(briefOf(brief)?.style ?? '').trim()
  const most = RENDER_SENTENCES + (style ? SENTENCES(style).length : 0)
  return w > RENDER_WORDS || told > most
    ? `This prompt is ${w} words, ${told} ${told === 1 ? 'sentence' : 'sentences'}; the video model was trained on short prompts: one or two sentences of what happens and the look, about ${RENDER_WORDS} words in all.`
    : null
}

function lengthWarning(text: string, step: WarnStep, brief?: unknown): string | null {
  const w = WORDS(text).length, s = SENTENCES(text).length
  if (step === 'still' || step === 'master') return w > 220 ? `This prompt is ${w} words; the draw follows short prompts best (under about 220).` : null
  if (step === 'klein') return w > 100 ? `This prompt is ${w} words; the finish follows short instructions best (under about 100).` : null
  if (step === 'render') return renderLength(text, brief)
  return s > 2 ? `This prompt is ${s} sentences; keep it to one or two.` : null
}

/** the action's words the text never mentions; null when there is no action to check */
function actionWarning(text: string, opts: WarnOpts): string | null {
  const b = briefOf(opts.brief)
  const action = opts.take?.action?.trim() || b?.beats?.find((x) => x?.does?.trim())?.does?.trim()
  if (!action) return null
  const want = stems(action)
  if (!want.length) return null
  const have = new Set(stems(text))
  return want.some((s) => have.has(s)) ? null : `The take's action (“${action}”) is not in this prompt, so the draw may not show it.`
}

function atmosphereWarning(text: string, opts: WarnOpts): string | null {
  const things = uniq((briefOf(opts.brief)?.atmosphere ?? []).map((a) => a?.what?.trim() ?? '').filter(Boolean))
  if (!things.length) return null
  const have = new Set(stems(text))
  const missing = things.filter((t) => { const s = stems(t); return s.length > 0 && !s.some((x) => have.has(x)) })
  return missing.length ? `The scene's ${missing.slice(0, 3).join(', ')} ${missing.length > 1 ? 'are' : 'is'} not in this prompt.` : null
}

export function warnPrompt(text: string, opts: WarnOpts): PromptWarning[] {
  const t = text ?? ''
  if (!t.trim()) return []
  const { step } = opts
  const out: PromptWarning[] = []
  const add = (code: WarnCode, message: string | null) => { if (message) out.push({ code, message }) }

  add('length', lengthWarning(t, step, opts.brief))
  const neg = hits(NEGATION, t)
  add('negation', neg.length ? `Negatives (${quote(neg)}) can draw the thing they name; say what is there instead.` : null)
  const q = hits(QUALITY, t)
  add('quality', q.length ? `Quality tags (${quote(q)}) do nothing for a photo-real draw and can push it toward an illustrated look.` : null)
  const style = String(briefOf(opts.brief)?.style ?? '').toLowerCase()
  const st = hits(STYLE, t).filter((w) => !style.includes(w))
  add('style', st.length ? `Look words (${quote(st)}) are not in this scene's brief; they set a look the scene did not ask for.` : null)
  if (opts.pasted) {
    const bad = bannedIn(t)
    add('fire-grain', bad.length
      ? `${quote(bad)} will go as written. ${bad.some((w) => !GRAIN.test(w)) ? 'Fire words make the draw paint a visible fire. ' : ''}${bad.some((w) => GRAIN.test(w)) ? 'Grain words stack on the grain the finish already adds.' : ''}`.trim()
      : null)
  }
  if (step === 'still' || step === 'render' || step === 'window') add('action', actionWarning(t, opts))
  if (step === 'still' || step === 'master' || step === 'render') add('atmosphere', atmosphereWarning(t, opts))
  if (step === 'render' || step === 'window') {
    const p = hits(PIPELINE, t)
    add('pipeline-words', p.length ? `Words about how it is made (${quote(p)}) are read as things to show; describe what is seen instead.` : null)
  }
  return out
}

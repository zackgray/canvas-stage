// (layout wave L3) Warn-only checks for a prompt the Stage's paid draws send (the redraw's "What should change?" and the new
// person / prop screen). The same function the server's free preview routes run (server/prompt/warn.ts — a pure module the
// browser already bundles, like server/cast/prompts.ts via labs/projection/cast/api.ts), so the checks are exactly the other
// paid presses': they only tell, never rewrite; the text goes as typed.
// (wave 1, paste-camera-flag) Local text rules for the other way words arrive at the Stage: pasted from elsewhere with the
// camera and lens language of a shot list ("low-angle tracking shot, 85mm lens, shallow depth of field"). The Stage sets the
// camera itself, so these words can only confuse the draw: cameraPhrases finds them, stripCameraPhrases takes just them out.
// Plain regexes, no AI; the words are never changed unasked — the Tidy press is the owner's.
import { warnPrompt } from '../../../server/prompt/warn'
import type { PromptWarning } from '../../shared/stillPressContract'

/** the warn-only notes on text a Stage draw would send (a user-typed change or description reads as pasted words) */
export function promptWarnings(text: string): PromptWarning[] {
  return warnPrompt(text, { step: 'master', pasted: true })
}

/**
 * The camera and lens phrases the rules know (each matches with its camera words, case-insensitive; a <word> shot matches the
 * adjective with it, so "low-angle tracking shot" is found whole). Only shot-list language is listed: no brand, crowd, boilerplate
 * or length policing — that is the owner's side of the words.
 */
const CAMERA_RULES: RegExp[] = [
  /\b(?:extreme(?:ly)?|wide|medium|tight|full|long|establishing|master)\s+shot\b/gi,
  /\b(?:close[- ]?up|extreme\s+close[- ]?up|two[- ]shot|insert|money)\s*shot\b/gi,
  /\b(?:tracking|dolly|crane|aerial|drone|panning|tilting|whip|follow|following|handheld|static)\s+shot\b/gi,
  /\b(?:low|high|eye[- ]level|worm'?s[- ]eye|bird'?s[- ]eye|dutch|over[- ]the[- ]shoulder|OTS|POV|point[- ]of[- ]view)\s*[- ]?(?:angle\s+)?shot\b/gi,
  /\b(?:low|high|eye[- ]level|worm'?s[- ]eye|bird'?s[- ]eye|dutch)[- ]angle\b/gi,
  /\btracking\b/gi,
  /\bdolly(?:\s+(?:in|out|zoom))?\b/gi,
  /\b(?:pan|tilt|crane)\s+(?:left|right|up|down)\b/gi,
  /\brack\s+focus\b/gi,
  /\b\d{2,3}\s?mm(?:\s+(?:lens|prime|zoom))?\b/gi,
  /\bf\/\d+(?:\.\d+)?\b/gi,
  /\b(?:shallow|deep|narrow|wide)\s+depth\s+of\s+field\b/gi,
  /\bdepth\s+of\s+field\b/gi,
  /\b(?:focal\s+length|aperture|bokeh|anamorphic|telephoto|wide[- ]angle\s+lens|lens\s+flare)\b/gi,
]

/** a camera or lens phrase found in the words: where it sits and the text it matches */
export interface CameraPhrase { start: number; end: number; text: string }

/** every camera or lens phrase in the words, in order, overlaps merged (pure; empty when nothing is found) */
export function cameraPhrases(text: string): CameraPhrase[] {
  const spans: CameraPhrase[] = []
  for (const rule of CAMERA_RULES) {
    rule.lastIndex = 0
    for (const m of text.matchAll(rule)) spans.push({ start: m.index!, end: m.index! + m[0].length, text: m[0] })
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end)
  // a phrase that reads as a noun with its article loses the article with it ("a low-angle tracking shot" -> ""), never one
  // the sentence keeps ("the tracking shot ends" keeps its "the": only an article sitting directly on the phrase goes)
  for (const s of spans) {
    const m = /(?:^|[^A-Za-z])(a|an|the) $/i.exec(text.slice(0, s.start))
    if (m) s.start -= m[1].length + 1
  }
  const out: CameraPhrase[] = []
  for (const s of spans) {
    const last = out.at(-1)
    if (last && s.start < last.end) { if (s.end > last.end) { last.end = s.end; last.text = text.slice(last.start, last.end) } } else out.push({ ...s })
  }
  return out
}

/** whether the words carry any camera or lens language (the note shows when they do) */
export const hasCameraWords = (text: string): boolean => cameraPhrases(text).length > 0

/** the words with just the camera and lens phrases taken out, one following separator (", " / "; ") swallowed with each, the
 *  sentence seams tidied (a leading ". " or stray commas left by the cut go too) */
export function stripCameraPhrases(text: string): string {
  let out = ''
  let at = 0
  for (const p of cameraPhrases(text)) {
    let end = p.end
    const follow = /^[ \t]*[,;][ \t]*/.exec(text.slice(end))
    if (follow) end += follow[0].length
    out += text.slice(at, p.start)
    at = end
  }
  out += text.slice(at)
  return out
    .replace(/\s{2,}/g, ' ')
    .replace(/([,.;:!?]) ?([,.;:!?])/g, '$1')
    .replace(/^\s*[,.;:!?]+\s*/, '')
    .trim()
}

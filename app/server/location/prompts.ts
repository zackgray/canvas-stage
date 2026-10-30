/**
 * Location prompts, E18's template (experiments/lib/e18-prompts.ts, docs/photoreal-prompting.md):
 *   "Photo of <description>, seen from <framing>. <surfaces>. <the ground into depth>. <light>. <lens + aperture>, <film>."
 * Subject first, camera last; one lens phrase and one film phrase; no quality tags ("photorealistic" reads as a
 * painting style, "8k / masterpiece" do nothing or pull towards CG); exclusions written as positive presence ("the
 * empty ground"), because Z-Image Turbo is distilled (CFG 1) and has no working negative: "no text" primes text.
 * At most one short quoted sign; 80 words or fewer. Framing is set-friendly: eye level, natural perspective, the ground
 * plane running from the bottom of the frame into depth, never the frontal "whole facade centred" catalogue shot.
 * The user types a short description; the presets add the rest. The lab shows the assembled text in an editable box,
 * and what is shown is exactly what is sent and stored (no rewriting on the server).
 */
import type { Framing, Lens, Light, PromptForm } from './types.ts'

export const FRAMINGS: Record<Framing, { label: string; seen: string; ground: string }> = {
  wide: {
    label: 'Eye-level establishing',
    seen: 'eye level across the way, at a slight angle',
    ground: 'The empty ground fills the lower third of the frame',
  },
  along: {
    label: 'Looking along it',
    seen: 'eye level at its near end, looking along it',
    ground: 'The empty ground runs from the bottom of the frame into the distance',
  },
  'low-angle': {
    label: 'Slight low angle',
    seen: 'a slight low angle, natural perspective',
    ground: 'The empty ground runs from the bottom of the frame into the distance',
  },
}

/**
 * One key light (source, direction, colour, how it meets surfaces) and one fill, in E18's words. The presets add at
 * most 50 words, leaving 30 for the description.
 */
export const LIGHTS: Record<Light, { label: string; phrase: string }> = {
  golden: { label: 'Golden hour, sun raking from the left', phrase: 'Low warm sun rakes the surfaces from the left; cool blue shade' },
  overcast: { label: 'Overcast daylight', phrase: 'Soft overcast daylight picks out every chip and stain; gentle shadows' },
  night: {
    label: 'Night: sodium + neon',
    phrase: 'A few small, dim neon signs glow through thin fog; one weak sodium lamp, deep shadows',
  },
  'blue-hour': { label: 'Blue hour', phrase: 'Blue dusk after sunset, warm light from a few windows; soft cool shade' },
  firelight: { label: 'Firelight', phrase: 'Warm flickering firelight from nearby flames lights the surfaces from low down; deep shadows beyond' },
  dusk: { label: 'Natural dusk', phrase: 'Natural dusk, the sky fading from pale orange low down to deep blue above; soft even shade' },
  moonlit: { label: 'Moonlit night', phrase: 'Cool pale moonlight from a high moon silvers the surfaces; deep blue shadows, a faint mist' },
}

/** One lens phrase + one film phrase (never a camera body, ISO or shutter speed). */
export const LENSES: Record<Lens, { label: string; lens: string; film: string }> = {
  '24-portra': { label: '24mm f/8, Kodak Portra 400 (day)', lens: '24mm lens at f/8', film: 'Kodak Portra 400' },
  '28-cinestill': { label: '28mm wide open, Cinestill 800T (night)', lens: '28mm lens wide open', film: 'Cinestill 800T' },
  '35-fuji': { label: '35mm f/4, Fuji Pro 400H (soft)', lens: '35mm lens at f/4', film: 'Fujifilm Pro 400H' },
}

export const FRAMING_KEYS = Object.keys(FRAMINGS) as Framing[]
export const LIGHT_KEYS = Object.keys(LIGHTS) as Light[]
export const LENS_KEYS = Object.keys(LENSES) as Lens[]
export const DEFAULT_FORM: Omit<PromptForm, 'description'> = { framing: 'wide', light: 'golden', lens: '24-portra' }

export const MAX_DESCRIPTION = 1000
/** The prompt as posted (hand edits included); generous, the 80-word guidance is a warning, not a refusal. */
export const MAX_PROMPT = 2000
/** E18's limit (Klein's; Z-Image Turbo wants 3-5 strong concepts in natural sentences). */
export const MAX_WORDS = 80

/**
 * Quality tags that work against a photograph (docs/photoreal-prompting.md "What works across models" 3). Dropped
 * from the description when the prompt is assembled, and warned about in a hand-edited prompt.
 */
export const BANNED = [
  'photorealistic', 'photo-realistic', 'hyperrealistic', 'hyper-realistic', 'ultra-realistic', 'ultra realistic',
  '8k', '4k', 'ultra hd', 'uhd', 'masterpiece', 'best quality', 'high quality', 'highly detailed',
  'octane render', 'unreal engine', 'trending on artstation',
] as const

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const bannedRe = () => new RegExp(`(?<![\\w-])(${BANNED.map(esc).join('|')})(?![\\w-])`, 'gi')

export const words = (s: string) => s.split(/\s+/).filter(Boolean).length

/** The banned tags in `s`, lower-cased, in order of appearance. */
export function bannedIn(s: string): string[] {
  return [...s.matchAll(bannedRe())].map((m) => m[1].toLowerCase())
}

/** Collapse whitespace and drop trailing separators, so "…street. " and "…street" make the same prompt. */
export function tidyDescription(s: string): string {
  return s.replace(/\s+/g, ' ').trim().replace(/[\s,.;]+$/, '')
}

/** The description without quality tags (and the commas they leave behind). */
export function scrubDescription(s: string): string {
  return tidyDescription(s.replace(bannedRe(), ' ').replace(/\s*,(\s*,)+/g, ',').replace(/(^|[.;:])\s*,/g, '$1')
    .replace(/,\s*([.;:])/g, '$1').replace(/\s+([,.;:])/g, '$1'))
}

/**
 * Split a description into its subject (first sentence, after "Photo of") and the sentences that follow (materials
 * and surfaces, placed after the framing as in E18's bank prompt). A leading "photo of" is dropped (the template
 * says it), and a leading article is lower-cased ("A dark alley" -> "Photo of a dark alley").
 */
export function splitDescription(description: string): { subject: string; rest: string[] } {
  const parts = scrubDescription(description).split(/(?<=[.!?])\s+/).map((p) => p.replace(/[\s.!?]+$/, '')).filter(Boolean)
  const subject = (parts[0] ?? '').replace(/^(a\s+)?photo(graph)?\s+of\s+/i, '').replace(/^(A|An|The)\b/, (w) => w.toLowerCase())
  return { subject, rest: parts.slice(1) }
}

/** The prompt for a form, or '' while there is no description. Stable: the same form always makes the same text. */
export function locationPrompt(f: PromptForm): string {
  const { subject, rest } = splitDescription(f.description)
  if (!subject) return ''
  const framing = FRAMINGS[f.framing]
  const lens = LENSES[f.lens]
  return [
    `Photo of ${subject}, seen from ${framing.seen}.`,
    ...rest.map((s) => `${s}.`),
    `${framing.ground}.`,
    `${LIGHTS[f.light].phrase}.`,
    `${lens.lens}, ${lens.film}.`,
  ].join(' ')
}

/** What the lab warns about in the prompt it is about to send (shown, never enforced: the user may know better). */
export function promptWarnings(prompt: string): string[] {
  const out: string[] = []
  const n = words(prompt)
  if (n > MAX_WORDS) out.push(`${n} words: past ${MAX_WORDS} the model starts dropping details. Cut the least important.`)
  const banned = [...new Set(bannedIn(prompt))]
  if (banned.length) out.push(`Drop ${banned.map((b) => `"${b}"`).join(', ')}: quality tags pull towards a render, not a photo.`)
  const neg = prompt.match(/\b(no|without)\s+[a-z]+/i)
  if (neg) out.push(`"${neg[0]}": Z-Image Turbo has no negative prompt, so this can add what it names. Describe what is there instead ("an empty street").`)
  if ((prompt.match(/\b\d{2,3}\s?mm\b/gi) ?? []).length > 1) out.push('More than one lens: keep one lens phrase and one film stock.')
  if ((prompt.match(/"[^"]*"/g) ?? []).length > 1) out.push('More than one quoted sign: keep at most one short one.')
  return out
}

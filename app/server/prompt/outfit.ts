/**
 * Position-free prompt text for the Wave 2 chain (docs/chain-contract.md, "Prompts"). E43 found that "on the left,
 * Olivia ... on the right, Kade" in a reskin prompt swapped the identities after the two people crossed; E47 found that
 * the prompt and the silhouettes bind identity, not mask colours. So any prompt that names who wears what must carry no
 * screen position: no left/right, no behind/in front. Consumers: server/realism and server/reskin (outfitLine,
 * positionFreePrompt). Pure; no imports, no I/O.
 */

/** The part of a cast card an outfit line needs (CardPayload fields plus the ingredient name). */
export interface OutfitCard { name: string; description: string }

const SIDE = '(?:left|right)(?:-hand)?'
/** a side word that is a whole word and not the start of a longer one (not "rightly", "bright", "left-handed") */
const END = '(?![\\w-])'
const DET = '(?:the|his|her|their|its)'
const PREP = '(?:on|to|at|from|toward|towards|in|along|by)'

/** [pattern, replacement], applied in order, case-insensitive. Relational wording first, absolute wording after. */
const RULES: [RegExp, string][] = [
  // camera side: ", seen from behind and slightly to the side" (the comma before it goes too)
  [new RegExp(`,?\\s*(?:seen |viewed |filmed |shot )?from (?:directly |just )?behind(?: and (?:slightly )?(?:to|from) the side)?${END}`, 'gi'), ''],
  // relational: "to the left of Kade" -> "beside Kade"
  [new RegExp(`\\b${PREP} ${DET} (?:far )?${SIDE}(?: side)? of${END}`, 'gi'), 'beside'],
  [new RegExp(`\\b${PREP} (?:the )?(?:far )?${SIDE}(?: side)? of${END}`, 'gi'), 'beside'],
  // "on the left is Olivia; on the right is Kade" -> "Olivia; Kade"
  [new RegExp(`\\b${PREP} ${DET} (?:far )?${SIDE}(?: side)? (?:is|are|stands?|stood)${END}\\s*`, 'gi'), ''],
  // absolute at a sentence start: "On the left, Olivia, ..." -> "Olivia, ..." (the comma that closed the phrase goes too)
  [new RegExp(`(^|[.!?]\\s+)${PREP} ${DET} (?:far )?${SIDE}(?: side)?(?: of (?:the )?(?:frame|shot|screen|image|picture))?${END}\\s*,?\\s*`, 'gi'), '$1'],
  // absolute elsewhere: "a woman on his right, rust jacket" -> "a woman, rust jacket"
  [new RegExp(`\\s*\\b${PREP} ${DET} (?:far )?${SIDE}(?: side)?(?: of (?:the )?(?:frame|shot|screen|image|picture))?${END}`, 'gi'), ''],
  // "the left one" / "the right man" -> "the one" / "the man"
  [new RegExp(`\\b(${DET}) ${SIDE} (one|man|woman|person|skier|figure|fighter|character)${END}`, 'gi'), '$1 $2'],
  // depth wording
  [/\bin front of(?![\w-])/gi, 'near'],
  [/\b(?:in back of|behind)(?![\w-])/gi, 'near'],
  // placement and facing from a still's blocking (Place stances once went to a 97-frame reskin). Whole phrases only, each
  // anchored on words ordinary outfit text does not use that way ("apart", "backs to us", "facing the camera").
  [new RegExp(`,?\\s*\\b(?:about |roughly |around |some |nearly |almost |just )?(?:\\d+(?:\\.\\d+)?|an?|one|two|three|four|five|six|a few|several|half a)[\\s-]*(?:metres?|meters?|m|feet|foot|ft|yards?|paces?|steps?) apart${END}`, 'gi'), ''],
  [new RegExp(`,?\\s*\\b(?:with )?${DET} backs? (?:turned )?to (?:us|the camera|the lens|the viewer)${END}`, 'gi'), ''],
  [new RegExp(`,?\\s*\\b(?:turned |turning )?facing (?:us|the camera|the lens|the viewer)${END}`, 'gi'), ''],
  // a glance over the shoulder (a gesture at one instant); "a bag over her shoulder" is outfit text and stays
  [/\b(look(?:s|ing)?|glanc(?:e|es|ing)|peer(?:s|ing)?)(?: back)? over (?:their|his|her|its|one|a) shoulders?(?![\w-])/gi, '$1'],
  [/,?\s*\bside[- ]by[- ]side(?![\w-])/gi, ''],
]

/** Removes or rewrites left/right/behind/in-front-of wording. Body parts ("a straight right punch") are left alone. */
export function stripPositions(text: string): string {
  let t = text
  for (const [re, to] of RULES) t = t.replace(re, to)
  return t
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/([,;])\s*([,.;])/g, '$2')
    .replace(/(^|[.!?]\s+)[,;:]\s*/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

const MAX_LINE = 400

/** One position-free sentence for a cast card, built from its name and description: "Theo is a tall man in a dark coat." */
export function outfitLine(card: OutfitCard): string {
  const name = card.name.trim()
  let d = stripPositions(card.description.replace(/\s+/g, ' ').trim())
  d = d.replace(/[.!?\s]+$/, '').replace(/[.!?]\s+(\S)/g, (_, c: string) => `; ${c.toLowerCase()}`) // one sentence: later ones join with "; "
  if (d.length > MAX_LINE) d = d.slice(0, MAX_LINE).replace(/[\s,;]+\S*$/, '')
  if (!d) return name ? `${name}.` : ''
  if (!name) return `${d.charAt(0).toUpperCase()}${d.slice(1)}.`
  const body = `${d.charAt(0).toLowerCase()}${d.slice(1)}`
  return `${name} is ${body}.`
}

export interface PromptParts {
  /** app-authored lead in a closed vocabulary with no screen position (the Realism lead and facing clause, E54). It goes
   *  first and is NOT stripped, so "with their backs to the camera" survives where a person's or a still's words would not */
  fixed?: string
  /** the scene preset's text (what happens, the camera) */
  scene?: string
  /** cast cards in Place order; one outfit line each */
  cast?: OutfitCard[]
  /** extra sentences (the location's lighting line, style) */
  extra?: string[]
}

const sentence = (s: string | undefined) => { const t = (s ?? '').trim(); return !t || /[.!?]$/.test(t) ? t : `${t}.` }

/** [fixed] + scene + one outfit line per cast card + extras, joined; everything but `fixed` stripped of position wording. */
export function positionFreePrompt(parts: PromptParts): string {
  const sentences = [parts.scene, ...(parts.cast ?? []).map(outfitLine), ...(parts.extra ?? [])].map(sentence).filter(Boolean)
  return [sentence(parts.fixed), stripPositions(sentences.join(' '))].filter(Boolean).join(' ')
}

/**
 * The idea's defining details, pulled out by the program (no model): its period ("1950s"), place ("coastal", "Asian"), ages
 * ("teenage", "kids"), time of day, weather and air ("breath fogging", "steam"), light sources ("lamps"), named instruments and the
 * unsupported things it names ("bicycle"). After Develop each one must still be somewhere in the brief (prose, looks, lighting,
 * materials, background or beats, near-synonyms allowed); any the model dropped come back as a visible warning, never silently.
 * Free: no second model call. Pure.
 */
import { BRIEF_LEFT_OUT as LEFT_OUT, type BriefWarning, type SceneBrief } from '../../src/shared/bibleContract.ts'
import type { SceneBriefV2 } from '../../src/shared/briefContract.ts'
import { findUnsupported, type Rule } from './unsupported.ts'

export interface KeepTerm { /** as the idea wrote it */ word: string; /** found in the brief = kept */ keep: RegExp; /** the rule an unsupported thing breaks */ rule?: Rule }

const rx = (s: string) => new RegExp(`\\b(?:${s})\\b`, 'i')
/** [found in the idea, also counts as kept] */
const LEXICON: [string, string?][] = [
  // period
  ['victorian|edwardian|medieval|georgian|elizabethan|regency|prohibition|wartime|pre-war|post-war|art deco|bronze age|iron age|stone age|ancient|futuristic|vintage|retro|cyberpunk|feudal|colonial|soviet'],
  // ages
  ['teen(?:age|aged|ager|agers|s)?|adolescents?'],
  ['kids?|child|children|toddlers?|youngsters?|schoolchildren|(?:\\w+)[- ]year[- ]olds?', 'kids?|child(?:ren)?|toddlers?|boys?|girls?|youngsters?|\\w+[- ]year[- ]olds?'],
  ['elderly|old (?:man|woman|men|women|lady|couple)|grey-haired|gray-haired|grand(?:mother|father|ma|pa)s?|pensioners?', 'elderly|old|grey|gray|grand\\w*|aged|aging|ageing|wrinkled'],
  ['bab(?:y|ies)|infants?|newborns?'],
  // time of day
  ['noon|midday', 'noon|midday'], ['dawn|sunrise|daybreak', 'dawn|sunrise|daybreak|first light'], ['dusk|sunset|twilight|nightfall', 'dusk|sunset|twilight|nightfall|evening'],
  ['night|midnight|nighttime', 'night\\w*|midnight'], ['morning'], ['afternoon'],
  // weather and air
  ['rain\\w*'], ['snow\\w*'], ['fog\\w*', 'fog\\w*|mist\\w*|haz\\w*'], ['mist\\w*', 'fog\\w*|mist\\w*|haz\\w*'], ['smok\\w*'], ['steam\\w*'], ['dust\\w*'], ['breath\\w*'],
  ['shimmer\\w*'], ['storm\\w*'], ['neon'],
  // light sources
  ['lamps?|lamplight|lamplit', 'lamp\\w*|lantern\\w*'], ['lanterns?', 'lamp\\w*|lantern\\w*'], ['candles?|candlelit|candlelight', 'candle\\w*'], ['spotlights?'], ['torches|torch|torchlight|torchlit', 'torch\\w*'],
  // the light's shape (prompt wave: the idea's light is kept as fields; "low golden sun behind her" must not come back as noon)
  ['backlit|backlight\\w*|contre-jour', 'back\\w*|behind|rim'], ['silhouett\\w*', 'silhouett\\w*|back\\w*|behind'], ['rim[- ]?light\\w*|rim-lit', 'rim\\w*'],
  ['golden', 'gold\\w*|amber'], ['low (?:\\w+ )?sun|low sunlight', 'low'], ['moonlight|moonlit|moon', 'moon\\w*'], ['overcast', 'overcast|cloud\\w*|grey|gray'],
  ['firelight|firelit', 'fire\\w*'], ['headlights?|headlamps?', 'head\\s?(?:light|lamp)\\w*'], ['shafts? of light|god ?rays|light beams?', 'shaft\\w*|ray\\w*|beam\\w*'],
  // in the air
  ['bees|bee|wasps?|insects?|flies|moths?|fireflies|midges|gnats', 'bees?|wasp\\w*|insect\\w*|flies|moth\\w*|firefl\\w*|midge\\w*|gnat\\w*'],
  ['leaves|leaf', 'lea(?:f|ves)\\w*'], ['petals?|blossoms?', 'petal\\w*|blossom\\w*'], ['sparks?', 'spark\\w*'], ['embers?', 'ember\\w*'],
  ['ash(?:es)?|ashfall', 'ash\\w*'], ['confetti'], ['bubbles?', 'bubbl\\w*'], ['spray|sea spray', 'spray\\w*'], ['pollen'], ['feathers?', 'feather\\w*'], ['sand ?storm|blowing sand', 'sand\\w*'],
  // the camera the idea asks for (Develop keeps it in `camera`, the operator decides the real move)
  ['close[- ]?ups?', 'close'], ['wide shot|wide angle|wide-angle', 'wide'], ['low[- ]angle|low camera|from below|worm\'?s[- ]eye', 'low|below|looking up'],
  ['looking up', 'looking up|low|below'], ['high[- ]angle|bird\'?s[- ]eye|top[- ]down|from above', 'high|above|overhead|top'],
  ['push[- ]?in|dolly[- ]?in|pushes in', 'push(?:es|ing)?[- ]?in|dolly\\w*|closer|moves? in'], ['pull[- ]?back|pulls back|dolly[- ]?out', 'pull\\w*|dolly\\w*|draws? back|widen\\w*'],
  ['tracking|tracks (?:alongside|beside|with)', 'track\\w*|follow\\w*|alongside'], ['pans?|panning', 'pan\\w*'], ['tilts? up|tilts? down|tilting', 'tilt\\w*'],
  ['handheld|hand-held', 'hand-?held'], ['orbit\\w*|circles around', 'orbit\\w*|circl\\w*'], ['crane shot|crane up|crane down|jib', 'crane\\w*|jib|rise\\w*|descend\\w*'],
  ['slow motion|slow-motion', 'slow'],
  // instruments and sound
  ['piano'], ['bass'], ['drums?|drummer'], ['guitars?'], ['saxophones?|sax'], ['trumpets?'], ['violins?'], ['microphones?|mics?', 'mic(?:rophone)?s?'],
  // places
  ['coastal|coast', 'coast\\w*|seaside|shore\\w*|harbou?r|port|beach\\w*'], ['desert'], ['canyon'], ['mountains?', 'mountain\\w*|alpine'], ['alpine', 'alpine|mountain\\w*'],
  ['jungle'], ['tropical'], ['arctic'], ['city|urban', 'city|urban|town|downtown|streets?'], ['rural|countryside', 'rural|countryside|village|farm\\w*'],
  ['railway|railroad', 'rail\\w*|station'], ['station'], ['platform'], ['harbou?r', 'harbou?r|port|dock\\w*|quay'], ['market'], ['club'], ['underground|subway|metro'],
  ['island'], ['rooftops?'], ['alley\\w*'],
]
const DECADE_WORD: Record<string, string> = { 2: 'twenties', 3: 'thirties', 4: 'forties', 5: 'fifties', 6: 'sixties', 7: 'seventies', 8: 'eighties', 9: 'nineties' }
const decadeKeep = (d: string) => rx(`(?:1[0-9]|20)?${d}0s|'${d}0s|${DECADE_WORD[d]}`)

function periods(idea: string): KeepTerm[] {
  const out: KeepTerm[] = []
  for (const m of idea.matchAll(/(?:\b(?:1[0-9]|20)?([2-9])0s\b|'([2-9])0s\b)/gi)) out.push({ word: m[0], keep: decadeKeep(m[1] ?? m[2]) })
  for (const [d, w] of Object.entries(DECADE_WORD)) { const m = rx(w).exec(idea); if (m) out.push({ word: m[0], keep: decadeKeep(d) }) }
  for (const m of idea.matchAll(/\b(?:1[5-9]|20)\d{2}\b/g)) out.push({ word: m[0], keep: rx(m[0]) })
  for (const m of idea.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)[- ]century\b/gi)) out.push({ word: m[0], keep: rx(`${m[1]}(?:st|nd|rd|th)[- ]century`) })
  return out
}

/** proper words: capitalised, not starting a sentence or a clause after a colon ("Asian", "Lisbon", "Ana") */
function names(idea: string): KeepTerm[] {
  const out: KeepTerm[] = []
  for (const m of idea.matchAll(/(?<![.!?:;\n]\s*|^\s*)\b([A-Z][a-z]{2,})\b/g)) out.push({ word: m[1], keep: rx(`${m[1].toLowerCase()}\\w*`) })
  return out
}

/** the idea's defining details, each once */
export function mustKeep(idea: string): KeepTerm[] {
  const terms: KeepTerm[] = [...periods(idea)]
  for (const [find, keep] of LEXICON) { const m = rx(find).exec(idea); if (m) terms.push({ word: m[0], keep: rx(keep ?? find) }) }
  // the thing, not the act: a weak word ("rides") is not a detail the brief must keep, and a brief that turned the ride into
  // walking did right (m-6)
  for (const h of findUnsupported(idea).filter((u) => u.rule.re.test(u.word))) terms.push({ word: h.word, keep: rx(`${h.word.replace(/s$/, '')}\\w*`), rule: h.rule })
  terms.push(...names(idea))
  const seen = new Set<string>()
  return terms.filter((t) => { const k = t.word.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
}

/** every word a v2 brief holds beyond its flat lines: the place, the light's fields, atmosphere, materials, faces, beats, camera, style */
const v2Words = (v: SceneBriefV2): string[] => [
  ...Object.values(v.place), ...Object.values(v.light), ...v.atmosphere.flatMap((a) => [a.what, a.where]),
  ...v.elements.flatMap((e) => [e.materials, e.condition, e.face]), ...v.beats.flatMap((x) => [x.does, x.visible]),
  v.camera.size, v.camera.angle, v.camera.move, v.camera.lensFeel, v.style,
]

/** everything the brief says, as plain words (a tag like @water_tank reads "water tank"); a v2 brief's structured fields count too */
export const briefWords = (b: SceneBrief, v2?: SceneBriefV2) =>
  [b.brief, ...b.elements.flatMap((e) => [e.name, e.look]), b.lighting, b.materials, b.background, ...b.beats, ...(v2 ? v2Words(v2) : [])].join(' \n ').replace(/[@_]/g, ' ')

export function droppedTerms(idea: string, b: SceneBrief, v2?: SceneBriefV2): KeepTerm[] {
  const text = briefWords(b, v2)
  return mustKeep(idea).filter((t) => !t.keep.test(text))
}

const cap = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`
const wordIn = (word: string, s: string) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(s)

/**
 * The brief with a warning for every detail of the idea it dropped: an unsupported thing's own warning says so (the bicycle that
 * became "on foot"), the rest share one warning naming them all. The brief itself is not changed.
 */
export function withKeepWarnings(b: SceneBrief, idea: string, v2?: SceneBriefV2): SceneBrief {
  const warnings: BriefWarning[] = b.warnings.map((w) => ({ ...w }))
  const rest: string[] = []
  for (const t of droppedTerms(idea, b, v2)) {
    const own = warnings.find((w) => wordIn(t.word, w.element))
    if (!t.rule) rest.push(t.word)
    else if (!own) warnings.push({ element: t.word, issue: `${LEFT_OUT}. ${cap(t.rule.issue)}`, swap: t.rule.swap(t.word) })
    else if (!own.issue.startsWith(LEFT_OUT)) own.issue = `${LEFT_OUT}. ${cap(own.issue)}`
  }
  if (rest.length) warnings.push({ element: rest.join(', '), issue: LEFT_OUT, swap: rest.join(', ') })
  return { ...b, warnings }
}

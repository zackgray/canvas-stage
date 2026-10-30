/**
 * One person stays one person in the still's words (consistency pass, 2026-10-27). The beekeeper coverage test drew a second woman:
 * the prompt named a person three times (the card, its role, and a beat "A beekeeper tends her hives…" said as its own sentence) and
 * never said she was alone. Two small rules, both pure:
 *  - a story line that opens with an article and the card's own person word ("A beekeeper tends…" when the card is a working
 *    beekeeper) is the same person: it opens with her pronoun instead ("She tends…"); a card that gives no he or she keeps the noun
 *    with "The" ("The beekeeper tends…");
 *  - when the figures say exactly one person, one positive line says so ("She is alone in the picture, the only person in it."),
 *    positive so the warn-only negation check stays clean; what must not be drawn goes in the draw's negative (qwenGraph.ts).
 * (stage-only) headNoun and isRole moved here from wornWords.ts, deleted with the card rewrite and the loose-cloth line it served.
 */
import type { Figure } from './figures.ts'

const ARTICLE_LED = /^(a|an|some)\s/i
/** a clause's head noun ends where a preposition, a participle or a relative starts */
const HEAD_END = /^(in|with|of|from|at|on|by|for|who|wearing|holding|carrying|under|over|behind|beside)$|^\w+(ed|ing)$/i
/** person words with no role suffix, and the role suffixes (a keeper, a maker, a farmer, an artist, a guardian, an actress) */
const ROLE_WORDS = /^(nurse|chef|cook|monk|nun|priest|pilot|guard|scout|king|queen|mother|father|widow|girl|boy|woman|man|lady|person|poet|clerk|maid|cowboy|cowgirl|pirate|witch|thief|spy|child|kid|teen|nomad|hermit|student|veteran|shepherd|medic|farmhand)$/i
const ROLE_SUFFIX = /(keeper|maker|smith|wright|man|woman|herd|monger|wife|master|er|or|ist|ian|eer|ess)$/i
/** things a person wears or carries whose names end like a role */
const NOT_ROLE = /^(sweater|jumper|blazer|slipper|trainer|sneaker|loafer|duster|gaiter|holster|feather|leather|collar|visor|liner|suspender|garter|pullover|cover|wrapper|warmer|flower|locket|ladder|hammer|poker|holder|filter|marker|paper|letter|mirror|razor|anchor|tractor|monitor|sensor|color|colour|parka|.*dress|.*ness|.*mitten)$/i

/** a noun phrase's head word: "a working cook" -> "cook", "a mesh net folded back" -> "net" */
export function headNoun(clause: string): string {
  const words = clause.trim().replace(/[.!?]+$/, '').split(/\s+/).slice(1)
  const end = words.findIndex((w, i) => i > 0 && HEAD_END.test(w))
  return (end < 0 ? words : words.slice(0, end)).at(-1)?.toLowerCase() ?? ''
}

/** the clause names what the person is (a role), not what they wear */
export function isRole(clause: string): boolean {
  if (!ARTICLE_LED.test(clause)) return false
  const head = headNoun(clause)
  return !!head && !NOT_ROLE.test(head) && (ROLE_WORDS.test(head) || ROLE_SUFFIX.test(head))
}

export type Pronoun = 'She' | 'He' | 'They'

/** the card's pronoun, from its own words: her / she / woman -> She, his / he / man -> He, else They */
export function pronounOf(description: string): Pronoun {
  if (/\b(she|her|hers|herself|woman|girl|lady)\b/i.test(description)) return 'She'
  if (/\b(he|him|his|himself|man|boy)\b/i.test(description)) return 'He'
  return 'They'
}

/** the person words the card's first sentence gives: its subject's head ("woman") and an appositive role right after it ("beekeeper") */
export function personNouns(description: string): string[] {
  const first = (description.split(/[.!?](\s|$)/)[0] ?? '').split(/,\s+/)
  if (!/^(a|an|the)\s/i.test(first[0] ?? '')) return []
  return [headNoun(first[0]), first[1] && isRole(first[1]) ? headNoun(first[1]) : ''].filter(Boolean)
}

/** "A beekeeper tends her hives" -> "She tends her hives" when the card's person is a beekeeper; anything else unchanged */
export function samePerson(line: string, description: string): string {
  const nouns = personNouns(description)
  if (!nouns.length) return line
  const m = new RegExp(`^(a|an|the)\\s+(?:[\\w-]+\\s+){0,2}?(${nouns.join('|')})\\s+(?=[a-z])`, 'i').exec(line)
  if (!m) return line
  const who = pronounOf(description)
  return `${who === 'They' ? `The ${m[2].toLowerCase()}` : who} ${line.slice(m[0].length)}`
}

/** exactly one person in the frame (the hero or one extra; a creature is not a person); unknown figures are not one */
export const onePerson = (figures: Figure[] | null | undefined): boolean =>
  !!figures && figures.filter((f) => f.tag === 'hero' || f.tag.startsWith('extra:')).length === 1

/** the still's alone line, in the card's pronoun */
export const aloneLine = (description: string): string => {
  const who = pronounOf(description)
  return `${who} ${who === 'They' ? 'are' : 'is'} alone in the picture, the only person in it.`
}

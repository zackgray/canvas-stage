// The story's beats, re-derived whenever the owner edits the brief's words by hand (the Board's brief box, the Story beats
// step after the set is built): the render prompt is built from the structured beats, so a text edit must write them again
// or a re-render would read the old words. The story is the last paragraph of the brief text (after the place, light and
// who-is-in-the-scene lines); each sentence is one beat of the person the story names — the one cast member it names, or
// the only person — said as a verb phrase: a leading subject (a pronoun, an article + the person's name, their @tag or
// name) is stripped and the first letter lowered, because the render joins "<person> <does>, then <does>". Pure.
import type { BriefBeat, SceneBriefV2 } from '../../../shared/briefContract'
import type { Piece } from './model'

const CAST = new Set(['person', 'creature', 'group'])
/** a beat's rough length, the default every prompt writer falls back to */
export const BEAT_SECONDS = 2
/** at most this many beats are kept (the render reads one main action per 2–3 s of take) */
const BEAT_MAX = 6

/** a cast member the story can name: their @tag and their name ("Tina", "the beekeeper") */
export interface StoryPerson { tag: string; name: string }

/** the board's cast as story persons (a tile off the board or a prop is not one), then any the sheet holds that the board lost */
export function beatPersons(pieces: readonly Piece[], v2: SceneBriefV2 | null | undefined): StoryPerson[] {
  const fromBoard = pieces.filter((p) => p.onBoard && CAST.has(p.type)).map((p) => ({ tag: p.tag, name: p.name }))
  const have = new Set(fromBoard.map((p) => p.tag))
  return [...fromBoard, ...(v2?.elements ?? []).filter((e) => CAST.has(e.type) && !have.has(e.tag)).map((e) => ({ tag: e.tag, name: e.name }))]
}

/** the story part of a brief text: its last paragraph (the place, light and who-is-in-the-scene lines come first) */
export const storyPart = (text: string): string => text.split(/\n+/).map((s) => s.trim()).filter(Boolean).at(-1) ?? ''

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** the name's words without a leading article ("The potter" -> ["potter"]) */
const nameWords = (name: string) => name.trim().replace(/^(the|a|an)\s+/i, '').split(/\s+/).filter(Boolean)

/** the story's beats in order, one per sentence, at most BEAT_MAX; none when there is no person to carry them */
export function storyBeats(story: string, persons: readonly StoryPerson[]): BriefBeat[] {
  const sentences = story.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? []
  if (!sentences.length) return []
  // the story's person: the cast member it names by @tag, else the one its name words name, else the only one
  const who = persons.find((p) => new RegExp(`@${esc(p.tag)}(?![a-z0-9_-])`, 'i').test(story))
    ?? persons.find((p) => { const ws = nameWords(p.name); return ws.length > 0 && new RegExp(`\\b${ws.map(esc).join('\\s+')}\\b`, 'i').test(story) })
    ?? persons[0]
  if (!who) return []
  const ws = nameWords(who.name).map(esc)
  const subjects = [
    /^(she|he|they)\s+/i,
    ...(ws.length ? [new RegExp(`^(a|an|the)\\s+${ws.join('\\s+')}\\s*`, 'i'), new RegExp(`^${ws.join('\\s+')}\\s*`, 'i')] : []),
    new RegExp(`^@${esc(who.tag)}(?![a-z0-9_-])\\s*`, 'i'),
  ]
  /** a sentence as the verb phrase the render joins: its leading subject off, the first letter lower; @tags inside stay */
  const strip = (sentence: string): string => {
    const s = sentence.replace(/[.!?]+$/, '').trim()
    const hit = subjects.map((re) => re.exec(s)).find((m) => m)
    const rest = (hit ? s.slice(hit[0].length) : s).trim()
    const does = rest || s
    return does ? does.charAt(0).toLowerCase() + does.slice(1) : does
  }
  return sentences.slice(0, BEAT_MAX).map((sentence) => ({ who: `@${who.tag}`, does: strip(sentence), seconds: BEAT_SECONDS, visible: '' }))
}

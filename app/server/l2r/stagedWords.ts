/**
 * The default Render prompt of a kit take whose scene has words (stage-only plan, section 5: the scene words lead). (owner 10-29)
 * The user's words go as written, each @tag replaced once by its card (prompt/sceneWords.ts, the one tag rule: a staged person by
 * their Cast card, a prop or material by its line), a cast member who is not on the set left out (E137/E138). The card goes whole
 * unless the whole cards would push the prompt past the render's length guideline (warn.ts RENDER_WORDS, the 120 words the Render
 * warning holds the prompt to: the L2R card asks for short prompts); then every card goes as its first whole sentence. After the words, only what the machinery needs said: the take's action when
 * it is not the hero's own clause, each staged person the words do not name ("<who-phrase>[ <doing>].", so the clay's figure is
 * that person), a hand-placed creature the words do not say, and the brief's style when it has one. No camera line (the clay
 * video carries the exact move), no "Match the first frame", no "Keep the same … as the driver", no "Photoreal.": all rejected as
 * silent additions. Pure given what the caller read (stagedDefault.ts).
 */
import type { BibleRecord } from '../../src/shared/bibleContract.ts'
import type { SceneBriefV2 } from '../../src/shared/briefContract.ts'
import { elementCards, sceneWords, whoPhrase, wordCount } from '../prompt/sceneWords.ts'
import { RENDER_WORDS } from '../prompt/warn.ts'
import { cap, closer, list, tidy } from './prompt.ts'
import { unstagedCastTags, type Staged } from './stagedPrompt.ts'


/** the performance's hand-placed creatures as plain words ("a dragon looms in the background"), so the render says what the grey shape is */
export function creatureWords(creatures: readonly { kind: string }[] | undefined, said = ''): string {
  const kinds = [...new Set((creatures ?? []).map((c) => c.kind))].filter((k) => !new RegExp(`\\b${k}\\b`, 'i').test(said))
  const many = (k: string) => (creatures ?? []).filter((c) => c.kind === k).length > 1
  return kinds.length ? `${list(kinds.map((k) => (many(k) ? `${k}s` : `a ${k}`)))} ${kinds.length > 1 || many(kinds[0]) ? 'loom' : 'looms'} in the background` : ''
}

export interface WordsInput {
  bible: BibleRecord
  brief: SceneBriefV2 | null
  /** the staged people, hero first (stagedCast); `hero` = the first one is the performer's card */
  staged: Staged[]
  hero: { name?: string } | null
  action: string
  creatures?: readonly { kind: string }[]
}

const end = (s: string) => { const t = tidy(s); return t && !/[.!?]$/.test(t) ? `${t}.` : t }

export function fromWords(i: WordsInput): string {
  const whole = wordsPrompt(i, false)
  return wordCount(whole) > RENDER_WORDS ? wordsPrompt(i, true) : whole
}

function wordsPrompt(i: WordsInput, short: boolean): string {
  const { bible, brief, staged } = i
  const here = staged.flatMap((s) => (s.tag ? [s.tag] : []))
  const gone = unstagedCastTags(bible, staged)
  const heroTag = i.hero && staged[0]?.tag
  // a name for each tag's later mentions: the brief's element name, else the performer's card name; the rest say their tag
  const nameOf = (tag: string) => brief?.elements.find((e) => e.tag === tag)?.name || (tag === heroTag ? i.hero?.name : undefined)
  const elements = bible.elements.map((e) => ({ tag: e.tag, kind: e.kind, name: nameOf(e.tag) }))
  // each staged person by the card they were staged with; every other tag by its own line (a cast member nobody plays is dropped)
  const cards = elementCards(bible.elements.filter((e) => e.kind !== 'cast'))
  for (const s of staged) if (s.tag) cards[s.tag] = s.description

  const words = bible.prompt.trim()
  const named = (s: Staged) => !!s.tag && (words.includes(`@${s.tag}`) || i.action.includes(`@${s.tag}`))
  const missing = staged.filter((s) => !named(s))
  // the hero's own action rides with him when the words do not name him; otherwise the take's action follows the words, said
  // with his name ("the performer looks up" -> "Ana looks up"), unless the words already say it
  const rides = !!i.hero && !!staged[0] && missing.includes(staged[0]) && !!staged[0].doing
  const action = rides ? '' : i.action.trim().replace(/^(the\s+)?(performer|hero|actor|character|figure)\b/i, heroTag ? `@${heroTag}` : 'the person')
  const said = action && !words.toLowerCase().includes(action.toLowerCase().replace(/[.!?]+$/, '')) ? end(action) : ''
  const lead = sceneWords([end(words), said].filter(Boolean).join(' '), { elements, cards, short, drop: gone, staged: here })

  const people = missing.map((s) => end(cap(tidy(`${whoPhrase({ description: s.description })} ${s.doing}`))))
  const beast = creatureWords(i.creatures, `${words} ${i.action}`)
  return [end(cap(lead)), ...people, beast && `${cap(beast)}.`, closer(brief?.style)].filter(Boolean).join(' ')
}

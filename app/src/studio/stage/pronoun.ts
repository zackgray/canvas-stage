// What the Stage calls the performer: "she" / "he" from the cast card's own words (the Bible element's line and the brief's look for
// it), else the plain "they" — never a guess from a name. Pure copy; the panels read it through usePerformerWords.
import type { BibleRecord } from '../../shared/bibleContract'
import { heroTag, useWorldBible } from '../shoot/castNames'

export type Pronoun = 'she' | 'he' | 'they'

const FEM = /\b(woman|women|female|girl|lady|she|her|hers|queen|actress|mother|grandmother)\b/i
const MASC = /\b(man|men|male|boy|gentleman|he|his|him|king|actor|father|grandfather)\b/i

/** the pronoun a description implies: a clear one-sided read, else "they" */
export function pronounOf(text: string | null | undefined): Pronoun {
  const t = text ?? ''
  const f = FEM.test(t), m = MASC.test(t)
  return f && !m ? 'she' : m && !f ? 'he' : 'they'
}

/** the words of whoever plays the hero in this Bible: its cast element's line and the brief's name and look for the tag */
export function heroWords(bible: BibleRecord | null, castId?: string | null): string {
  const tag = heroTag(bible, castId)
  if (!tag) return ''
  const el = bible?.elements.find((e) => e.tag === tag)
  const b = (bible?.brief?.elements ?? []).find((e) => e.tag === tag)
  return [el?.line, b?.name, b?.look].filter(Boolean).join(' ')
}

export interface PerformerWords {
  stands: string; does: string; goes: string; dragHint: string; clear: string; walks: string; needs: string; starts: string; covers: string; move: string
}

/** the person panels' lines for a pronoun ("they" takes the plural verbs) */
export function performerWords(p: Pronoun): PerformerWords {
  const [s, o, pos] = p === 'she' ? ['she', 'her', 'her'] : p === 'he' ? ['he', 'him', 'his'] : ['they', 'them', 'their']
  const v = (sg: string, pl: string) => (p === 'they' ? pl : sg)
  return {
    stands: `Where ${s} ${v('stands', 'stand')}`, does: `What ${s} ${v('does', 'do')}`, goes: `Where ${s} ${v('goes', 'go')}`,
    dragHint: `Drag ${o} in the view to move ${o}.`, clear: `Clear ${pos} action`, walks: `${s[0].toUpperCase()}${s.slice(1)} ${v('walks', 'walk')}`,
    needs: `${s[0].toUpperCase()}${s.slice(1)} ${v('needs', 'need')}`, starts: `${s} ${v('starts', 'start')}`, covers: `${s} ${v('covers', 'cover')}`,
    move: `${pos[0].toUpperCase()}${pos.slice(1)} move`,
  }
}

/** the Stage's wording for the world's performer, from its Bible (plain "they" until it is read or when it says nothing clear) */
export function usePerformerWords(worldId: string | null | undefined, castId?: string | null): PerformerWords {
  const bible = useWorldBible(worldId)
  return performerWords(pronounOf(heroWords(bible, castId)))
}

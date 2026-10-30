/**
 * The place with nobody in it (master fix, 2026-10-25, run 4): a brief's setting is often the owner's whole first sentence ("An older
 * beekeeper in a white suit checks a hive at the edge of an orchard on a warm evening"), so the master, a picture of the place,
 * drew an invented person the set's depth has no body for, and a still said its person twice. The person words come from the cast
 * (its tags, its brief names, the role nouns of its card lines) plus generic person nouns; a sentence that names one keeps only the
 * place it puts them in ("at the edge of an orchard on a warm evening"), else it goes. Pure.
 */
import type { BibleRecord } from '../../src/shared/bibleContract.ts'

/** nouns that are a person whatever the scene */
const GENERIC = ['man', 'men', 'woman', 'women', 'person', 'people', 'persons', 'figure', 'boy', 'girl', 'child', 'children', 'kid',
  'lady', 'ladies', 'gentleman', 'gentlemen', 'guy', 'someone', 'somebody', 'crowd', 'stranger', 'he', 'she', 'they', 'him']
const DETERMINER = /^(a|an|the|one|two|some|this|that|our|my|your|his|her|their)$/i
/** a preposition that puts the subject somewhere: the place starts here */
const LOCATIVE = /\b(at|in|on|by|under|inside|beside|near|along|across|among|amid|beneath|outside|through|over|above|below|behind|within|around)\s+\S/gi

/** the nouns a card line or brief look names its person by: the last two words before "in", "with", "wearing" or a comma */
function roleNouns(line: string | undefined): string[] {
  const head = (line ?? '').split(/,|;|\.|\s(?:in|with|wearing|who|holding|carrying|and)\b/i)[0]
  return head.split(/\s+/).map((w) => w.replace(/[^a-z'-]/gi, '')).filter((w) => w.length > 2 && !DETERMINER.test(w)).slice(-2)
}

/** every word that names a person in this scene: generic nouns, the cast's tags and names, the role nouns of their lines */
export function personWords(bible: BibleRecord | null): string[] {
  const cast = (bible?.elements ?? []).filter((e) => e.kind === 'cast').flatMap((e) => [e.tag, ...roleNouns(e.line)])
  const people = (bible?.brief?.elements ?? []).filter((e) => e.type === 'person').flatMap((e) => [e.tag, ...e.name.split(/\s+/), ...roleNouns(e.look)])
  const out = [...GENERIC, ...cast, ...people].map((w) => w.toLowerCase().replace(/^@/, '').replace(/[_-]+/g, ' ').trim())
  return [...new Set(out.filter((w) => w.length > 1 && !DETERMINER.test(w)))]
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const personRe = (words: string[]) => new RegExp(`(^|[^\\w@])@?(${words.map(escape).sort((a, b) => b.length - a.length).join('|')})(s|es)?\\b`, 'i')
/** a place that is no place ("@ana is in the scene") */
const NOWHERE = /^(in|into|on) (the )?(scene|shot|picture|frame|story)[.\s]*$/i
const VERBISH = /\b[a-z]{3,}(s|ing|ed)\b/i

/** one sentence without its person: the text before the subject plus the place from the first locative after a verb; '' = all person */
function sentenceWithout(sen: string, re: RegExp): string {
  const m = re.exec(sen)
  if (!m) return sen
  const at = m.index + m[1].length
  const start = Math.max(sen.lastIndexOf(',', at), sen.lastIndexOf(';', at)) + 1
  const prefix = sen.slice(0, start).trim()
  const after = sen.slice(at + m[0].length - m[1].length)
  let place = ''
  for (const l of after.matchAll(LOCATIVE)) {
    const before = after.slice(0, l.index)
    if (VERBISH.test(before.replace(re, ' ')) || /\b(is|are|stands?|sits?|waits?)\b/i.test(before)) { place = after.slice(l.index); break }
  }
  // what the place still says about a person (", watching her bees") goes clause by clause
  place = place.split(/\s*,\s*/).filter((c) => c && !re.test(c) && !NOWHERE.test(c)).join(', ')
  return [prefix.replace(/[,;\s]+$/, ''), place].filter(Boolean).join(prefix && place ? ', ' : '')
}

/** the place text with every person taken out (a sentence that is all person goes); unchanged when it names nobody */
export function placeOnly(text: string, words: string[]): string {
  if (!text.trim() || !words.length) return text
  const re = personRe(words)
  const kept = text.split(/(?<=[.!?])\s+/).map((s) => sentenceWithout(s.trim(), re).replace(/[.\s]+$/, '')).filter(Boolean)
  return kept.join('. ')
}

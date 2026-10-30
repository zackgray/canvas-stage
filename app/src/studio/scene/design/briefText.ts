// The scene brief as text with @tags: splitting it into chips, the tag being typed, tags finished by hand, and the Bible's
// prompt (look-type tags become their words). Pure.
import { TAG_WORD } from '../../../shared/bibleContract'
import type { Piece } from './model'
import { elementKindOf } from './model'

/** a tag in the brief (the Bible's tag syntax) */
const TAG = new RegExp(`(?<![A-Za-z0-9_])@(${TAG_WORD})`, 'g')
/** a tag that is finished: something that cannot be part of it follows */
const DONE_TAG = new RegExp(`(?<![A-Za-z0-9_])@(${TAG_WORD})(?=[^a-z0-9_-])`, 'g')

export type Run = { text: string } | { tag: string }

/** text and tag runs, in order */
export function runs(text: string): Run[] {
  const out: Run[] = []
  let at = 0
  for (const m of text.matchAll(TAG)) {
    if (m.index! > at) out.push({ text: text.slice(at, m.index) })
    out.push({ tag: m[1] })
    at = m.index! + m[0].length
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}

/** every tag the brief mentions, in order of first mention */
export const briefTags = (text: string) => [...new Set([...text.matchAll(TAG)].map((m) => m[1]))]
/** a finished tag and where it sits in the text */
export interface DoneRun { tag: string; start: number; end: number }
/** every finished tag with its span, in order of first mention */
export function doneRuns(text: string): DoneRun[] {
  const out: DoneRun[] = []
  for (const m of text.matchAll(DONE_TAG)) out.push({ tag: m[1], start: m.index!, end: m.index! + m[0].length })
  return out
}

/** the "@partial" being typed just before the caret, for the @ menu */
export function atToken(text: string, caret: number): { start: number; q: string } | null {
  const m = /(^|[\s(])@([a-z0-9_-]*)$/i.exec(text.slice(0, caret))
  return m ? { start: caret - m[2].length - 1, q: m[2].toLowerCase() } : null
}

/** the text with the token at `start..caret` replaced by `@tag ` */
export function putTag(text: string, start: number, caret: number, tag: string): { text: string; caret: number } {
  const ins = `@${tag} `
  return { text: text.slice(0, start) + ins + text.slice(caret).replace(/^ /, ''), caret: start + ins.length }
}
/** `@tag` added at the end unless the brief already names it */
export function appendTag(text: string, tag: string): string {
  if (briefTags(text).includes(tag)) return text
  const t = text.trimEnd()
  return t ? `${t} @${tag} ` : `@${tag} `
}

const WORD = /[A-Za-z][A-Za-z'-]*/g
const stem = (w: string) => w.toLowerCase().replace(/(es|s)$/, '')
/** small words are never shown as the AI's: they carry no idea of their own */
const SMALL = new Set('a an the and or but of at in on by to for with from as is are was his her their its it he she they him them while then into through led'.split(' '))
export interface Mark { text?: string; tag?: string; added: boolean }
/** The brief's runs with what the AI added marked (a word or tag the idea did not have), added words joined into one run. */
export function markAdded(brief: string, idea: string): Mark[] {
  const have = new Set([...idea.matchAll(WORD)].map((m) => stem(m[0])))
  const out: Mark[] = []
  const push = (x: Mark) => {
    const last = out.at(-1)
    if (last?.text !== undefined && x.text !== undefined && (last.added === x.added || (last.added && /^[\s,]+$/.test(x.text)))) last.text += x.text
    else out.push({ ...x })
  }
  for (const r of runs(brief)) {
    if ('tag' in r) { out.push({ tag: r.tag, added: !r.tag.split(/[-_]/).some((w) => have.has(stem(w))) }); continue }
    let at = 0
    for (const m of r.text.matchAll(WORD)) {
      if (m.index! > at) push({ text: r.text.slice(at, m.index), added: false })
      push({ text: m[0], added: !SMALL.has(m[0].toLowerCase()) && !have.has(stem(m[0])) })
      at = m.index! + m[0].length
    }
    if (at < r.text.length) push({ text: r.text.slice(at), added: false })
  }
  return out
}

/**
 * The prompt the Bible keeps: cast, groups and materials in the scene stay tags (they are Bible elements); location, mood, beat
 * and lighting tags become their words, and a tag with no element (no tile, or a tile not in the scene) its name (the tile's, else
 * the one `names` gives it, else its own words), so the Bible never holds a tag with no element behind it.
 */
export function biblePrompt(text: string, pieces: readonly Piece[], names?: ReadonlyMap<string, string>): string {
  const rs = runs(text)
  let out = ''
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i]
    if ('text' in r) { out += r.text; continue }
    const p = pieces.find((x) => x.tag === r.tag)
    // a tag with no element behind it (no tile, or one not in the scene yet: a name typed before its look) is said as its name
    if (!p || (elementKindOf(p.type) && !p.onBoard)) { out += p?.name.trim() || names?.get(r.tag) || r.tag.replace(/[_-]+/g, ' '); continue }
    if (elementKindOf(p.type)) { out += `@${p.tag}`; continue }
    // a look tile says its words; one with none (an upload, a second pick) says nothing rather than its tile name ("Mood 2")
    const line = p.line.trim().replace(/\.$/, '')
    const next = rs[i + 1]
    // Guided writes "@location, <its words>": those words are the tile's line, so they are said once
    if (line && next && 'text' in next && next.text.replace(/^[\s,]+/, '').toLowerCase().startsWith(line.toLowerCase())) {
      rs[i + 1] = { text: next.text.replace(/^[\s,]+/, ' ') }
      continue
    }
    out += line
  }
  return out.replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').replace(/,(?=[,.])/g, '')
    .replace(/(^|[.!?]\s)[A-Z][a-z ]{0,30}:\s*\./g, '$1').replace(/\s+/g, ' ').trim()
}

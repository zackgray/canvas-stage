/**
 * Is a still behind the scene's Bible? (F1, prompt-wave fix pass.) Every settled Brief detail edit writes a new Bible version, so
 * comparing versions staled an approved still on any edit, even one that only feeds the render (a beat's wording, the camera move)
 * and even an edit undone again. A still now records what it was drawn from: one short hash per part of the Bible the still reads
 * (`bibleKeys`). It is behind only when one of those parts differs now, and the reason names that part.
 *
 * What the still reads from the brief: place, light, atmosphere, elements (materials, condition, face), style. What it does not:
 * logline, beats, camera, background, exclude, warnings and the provenance lists (developed, user). Every Bible field outside the
 * brief is guarded exactly as the version was (the scene prompt, the lines, reference tiles, master, candidates, grade, extras):
 * nothing the version check caught before goes unseen now, except render-only brief edits. A still drawn before keys were recorded
 * keeps the version rule (bibleMoved). Render (server/l2r/inputs.ts, keyframes.ts) and Shoot (the hero list's `bibleWhy`, from
 * server/hero/plugin.ts) use this one function. FNV-1a 32 over canonical JSON, so the browser and the server agree. Pure.
 */
import { bibleMoved, bibleMovedWhy, type BibleRecord } from './bibleContract.ts'

declare module './shotContract.ts' {
  interface HeroStill {
    /** (F1) a hash per still-relevant part of the Bible it was drawn against (stillBibleKeys); absent = an older still */
    bibleKeys?: Record<string, string>
    /** (F1, answered by GET /__lab/hero only, never stored) why the still is behind the Bible now, or was drawn before the set
     *  changed (l2r/inputs.ts stillSetMoved): the line Render refuses with */
    bibleWhy?: string
  }
}

/** the brief's parts a still is drawn from, in the order a reason names them */
const BRIEF_PARTS = ['place', 'light', 'atmosphere', 'elements', 'style'] as const
/** the Bible's fields that change on every write and say nothing about content */
const BOOKKEEPING = new Set(['version', 'createdAt', 'updatedAt', 'brief'])

const WORDS: Record<string, string> = {
  'brief.place': "the brief's place", 'brief.light': "the brief's light", 'brief.atmosphere': "the brief's atmosphere",
  'brief.elements': "the brief's elements (materials, condition or face)", 'brief.style': "the brief's style",
  prompt: 'the scene prompt', lighting: 'the lighting line', materials: 'the materials line', background: 'the background line',
  elements: "the scene's reference tiles", master: 'the approved master', candidates: 'the drawn masters', grade: 'the grade',
  extrasSheet: 'the extras sheet', worldId: 'the world',
}

function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(',')}}`
  }
  return JSON.stringify(v ?? null)
}
function fnv(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}

/** one hash per still-relevant part: `brief.<part>` for the brief's, the field name for every other Bible field */
export function stillBibleKeys(bible: BibleRecord): Record<string, string> {
  const out: Record<string, string> = {}
  const b = bible as unknown as Record<string, unknown>
  for (const k of Object.keys(b).sort()) if (!BOOKKEEPING.has(k) && b[k] !== undefined) out[k] = fnv(canon(b[k]))
  const brief = bible.brief as unknown as Record<string, unknown> | undefined
  if (brief) for (const p of BRIEF_PARTS) out[`brief.${p}`] = fnv(canon(brief[p]))
  return out
}

/** the parts that differ between a still's keys and the Bible now, brief parts first ([] = none) */
export function stillBibleDiff(keys: Record<string, string>, bible: BibleRecord): string[] {
  const now = stillBibleKeys(bible)
  const all = [...new Set([...Object.keys(keys), ...Object.keys(now)])]
  const changed = all.filter((k) => keys[k] !== now[k])
  return [...changed.filter((k) => k.startsWith('brief.')), ...changed.filter((k) => !k.startsWith('brief.'))]
}

/**
 * Why `still` is behind `bible`, as a sentence the still's badge and Render's refusal both show, or null when it is not. With
 * keys: the parts that changed ("The brief's light changed after this still was drawn"); without: the version rule as before.
 */
export function stillBibleWhy(still: { bibleVersion?: number; bibleKeys?: Record<string, string> }, bible: BibleRecord | null): string | null {
  if (!bible) return null
  if (!still.bibleKeys) {
    const why = bibleMovedWhy(still.bibleVersion, bible)
    return bibleMoved(still.bibleVersion, bible) && why ? `This still was drawn ${why}` : null
  }
  const diff = stillBibleDiff(still.bibleKeys, bible)
  if (!diff.length) return null
  // a brief edit also rewrites the flat lines derived from it: the brief's part is the reason, its lines are not named again
  const derived = new Set(['lighting', 'materials', 'background'])
  const parts = diff.filter((k) => !(diff[0].startsWith('brief.') && derived.has(k))).map((k) => WORDS[k] ?? `the scene sheet's ${k}`)
  const named = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return `${named.charAt(0).toUpperCase()}${named.slice(1)} changed after this still was drawn`
}

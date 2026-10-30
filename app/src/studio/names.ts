// Display names: ids stay the truth (files, URLs, records); the studio's pages show names. Pure, so it is unit-tested.
// "loc-2026-10-18T03-44-47-686" -> "Location · 18 Oct 03:44"; "perf-2026-10-19t21-56-20-955z-bmvft9k16-t1-lift" ->
// "Performance · 19 Oct 21:56 · lift"; a prompt, when the caller has one, names a location by its first noun phrase.
import { placeName } from './placeName'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The id kinds the lab writes, by their leading word. */
const KINDS: [RegExp, string][] = [
  [/^loc/, 'Location'], [/^perf/, 'Performance'], [/^warp/, 'Move'], [/^view/, 'View'], [/^crossview|^draft/, 'Draft'],
  [/^final/, 'Final'], [/^realism/, 'Realism'], [/^reskin/, 'Reskin'], [/^finished|^finish/, 'Finished'], [/^cut/, 'Cut'],
  [/^still/, 'Still'], [/^clip/, 'Clip'], [/^place/, 'Place'], [/^pack/, 'Performance'],
]

/** 2026-10-18T03-44-47-686 / 2026-10-18T03:44:47.686Z / 2026-10-19t21-56-20-955z */
const STAMP = /(\d{4})-(\d{2})-(\d{2})[Tt](\d{2})[-:](\d{2})(?:[-:](\d{2}))?(?:[-.](\d{1,3}))?[Zz]?/

/** "18 Oct 03:44" from the timestamp in `s` (read as written, no timezone shift), or null. */
export function stampOf(s: string): string | null {
  const m = STAMP.exec(s)
  if (!m) return null
  const month = MONTHS[Number(m[2]) - 1]
  return month ? `${Number(m[3])} ${month} ${m[4]}:${m[5]}` : null
}

/** The place a prompt describes: after "A photograph taken standing in one place:" or "A low shot ... of a", before any "(". */
function placeOf(prompt: string): string {
  let t = prompt.trim()
  const colon = t.indexOf(':')
  if (colon > 0 && colon < 70) t = t.slice(colon + 1)
  else {
    const of = /^(?:a|an|the)\s[^,.:]*\b(?:shot|photograph|photo|view)\b[^.:]*?\bof\s+(?:a|an|the)\s+/i.exec(t)
    if (of) t = t.slice(of[0].length)
  }
  return t.trim().replace(/\s*\(.*$/, '').replace(/^(?:a|an|the)\s+/i, '')
}

/** A set's name: the user's if there is one, else the first noun phrase of its description (placeName.ts), else its kind and date. */
export function locationName(id: string, opts: { name?: string | null; prompt?: string | null } = {}): string {
  if (opts.name?.trim()) return opts.name.trim()
  return placeName(placeOf(opts.prompt ?? '')) || displayName(id)
}

/** Any id as a person would say it. Unknown shapes come back with their timestamp and random tails removed. */
export function displayName(id: string): string {
  const stamp = stampOf(id)
  const lead = id.replace(/^.*\//, '').split(/[-_]/)[0]
  const kind = KINDS.find(([re]) => re.test(lead))?.[1] ?? null
  const tail = /-(lift|cast|recast|draft|final)\b/i.exec(id.replace(STAMP, ''))?.[1]?.toLowerCase() ?? null
  if (stamp) return [kind ?? 'Take', stamp].join(' · ') + (tail ? ` · ${tail}` : '')
  if (kind && /^[a-z]+-\d/.test(id)) return kind
  // a slug: "warehouse-fight-cast-1d" -> "Warehouse fight cast 1d"
  const words = id.replace(/^.*\//, '').replace(/[-_]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : id
}

/** Replace every timestamp-bearing id in a sentence ("rendered view-2026-10-19T22-31-01") with its name. */
export function scrubIds(text: string): string {
  return text.replace(/\b[a-z]+(?:-[a-z0-9]+)*-\d{4}-\d{2}-\d{2}[Tt][\d:.\-zZa-z]*/g, (m) => displayName(m))
}

/** World picker options: each set's name; sets that would share a name get their date so they can be told apart. */
export function worldOptions(worlds: { id: string; name?: string; prompt: string }[]): { value: string; label: string }[] {
  const names = worlds.map((s) => locationName(s.id, { name: s.name, prompt: s.prompt }))
  return worlds.map((s, i) => {
    const dup = names.filter((n) => n === names[i]).length > 1
    const stamp = dup ? stampOf(s.id) : null
    return { value: s.id, label: stamp ? `${names[i]} · ${stamp}` : names[i] }
  })
}

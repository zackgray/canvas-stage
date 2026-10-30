// A set's short name from its description: the first noun phrase, at most four words, in title case. Never a clause cut mid-way
// ("Long grass running", "Dawn breaks over"). Pure; names.ts uses it when a set has no name of its own.

const MAX_WORDS = 4
/** words that end a noun phrase: prepositions, joiners, number words, and the verbs a scene sentence opens its clauses with */
const STOP = new Set(('and or but with without of in on at to by from into onto over under along across beside behind between near through around above below ' +
  'is are was were has have as while where which that the a an one two three four five six seven eight nine ten').split(' '))
const TIME = new Set(['dawn', 'dusk', 'sunrise', 'sunset', 'morning', 'evening', 'night', 'noon', 'afternoon', 'twilight', 'midnight'])
/** a word after the first that starts the clause's verb: -ing forms and the common scene verbs */
const VERB = /ing$|^(?:breaks?|stands?|sits?|lies|runs?|rises?|falls?|stretches|hangs?|looks?|sweeps?|opens?|spreads?)$/i

const words = (t: string) => t.replace(/[()[\]"“”]/g, ' ').split(/\s+/).filter(Boolean)

/** the leading noun phrase of `t` (commas between adjectives are skipped), or [] when it opens with a stop word */
function phrase(t: string): string[] {
  const out: string[] = []
  for (const raw of words(t)) {
    const w = raw.replace(/[,.;:!?]+$/, '')
    if (!w || STOP.has(w.toLowerCase()) || (out.length && VERB.test(w))) break
    out.push(w)
    // a comma ends the phrase, unless only one word is down ("desolate, snowy mountain platform": an adjective list)
    if (out.length === MAX_WORDS || /[.;:!?]$/.test(raw) || (raw.endsWith(',') && out.length > 1)) break
  }
  return out
}

const title = (ws: string[]) => ws.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')

/** "Dawn breaks over a desolate, snowy mountain platform." -> "Desolate Snowy Mountain Platform"; "Long grass running along a bank" -> "Long Grass" */
export function placeName(sentence: string): string {
  const s = sentence.replace(/^\s*set\b[\s:,.-]+(?:(?:in|at|on)\s+)?/i, '').replace(/@/g, '').replace(/^\s*(?:an?|the)\s+/i, '').trim()
  const first = phrase(s)
  // a time of day is no name: take the place the sentence puts it in ("over a ... platform")
  if (!first.length || TIME.has(first[0].toLowerCase())) {
    const m = /\b(?:over|in|at|on|across|along|beside|by|near|inside|outside|around)\s+(?:an?\s+|the\s+)?([^.;]+)/i.exec(s)
    const place = m ? phrase(m[1]) : []
    if (place.length) return title(place)
  }
  return title(first)
}

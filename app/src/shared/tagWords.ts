/**
 * An @tag in brief text said as its element's name, with the article English needs (F3, prompt-wave fix pass): "lifts
 * @honeycomb_frame from @hive" -> "lifts the honeycomb frame from the hive". The v2 brief's gate (server/planner/briefV2.ts) runs every
 * story field through it, so Develop, a pasted brief and a saved row edit all reach the still and the render with their articles; the
 * render's briefWords (server/l2r/stagedDefault.ts) is the same function. The rules:
 *  - a determiner already there ("a", "his", "the" …) stands, and a name that leads with an article loses its own ("his @hive"),
 *    also with a word between that describes the thing ("his wooden @staff", "the parked K2 @van": one word, or two when the
 *    second is a capitalised or numbered name), never across a word that starts a new phrase ("a cook with @kettle");
 *  - a name written with its article keeps it ("The bicycle" -> "the bicycle" mid-sentence);
 *  - a person's name written capitalised and without an article is a proper name: said as written ("to @ana" -> "to Ana");
 *  - anything else is a common noun: "the" goes before it, its first letter lowered ("Honeycomb frame" -> "the honeycomb frame");
 *  - a tag no element answers to is its own words, as a common noun;
 *  - a tag with no stored name that is a label rather than a word ("car2", a digit in it) reads by that label, with no article
 *    ("toward car2", never "toward the car2").
 * Pure.
 */
interface Named { tag: string; name?: string; type?: string }

const DET = /(?:^|[\s(])(a|an|the|his|her|their|its|this|that|these|those|my|your|our|one|each|every|another|some|any|no)\s+$/i
const ARTICLE = /^(the|a|an)\s+/i
const TAG = /(?<![A-Za-z0-9_])@([a-z][a-z0-9_-]*)/gi
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? `${s[0].toLowerCase()}${s.slice(1)}` : s)
const DETS = 'a|an|the|his|her|their|its|this|that|these|those|my|your|our|one|each|every|another|some|any|no'
/** a determiner, then one describing word, or two when the second is a capitalised or numbered name, right before the tag */
const DESCRIBED = new RegExp(String.raw`(?:^|[\s(])(?:${DETS})\s+([A-Za-z][\w'-]*)\s+(?:([A-Z0-9][\w'-]*)\s+)?$`, 'i')
/** words that end the determiner's phrase: what follows them is a new thing ("a cook with @kettle", "the cook and @ana") */
const PHRASE_END = new Set(('with and or but of to from in on at by into onto over under near beside behind past through across for as ' +
  'is are was were be has have had then while who which that').split(' '))
/** the determiner before the tag stands for it: right before it, or before the words that describe it */
function determined(before: string): boolean {
  if (DET.test(before)) return true
  const m = DESCRIBED.exec(before)
  // (the pattern ignores case for the determiner, so the second word's capital or digit is checked here)
  return !!m && !PHRASE_END.has(m[1].toLowerCase()) && (!m[2] || /^[A-Z0-9]/.test(m[2]))
}

export function tagWords(text: string, elements: readonly Named[]): string {
  const byTag = new Map(elements.map((e) => [e.tag.toLowerCase(), e]))
  return (text ?? '').replace(TAG, (_m, t: string, at: number, all: string) => {
    const el = byTag.get(t.toLowerCase())
    const stored = (el?.name ?? '').trim().replace(/\s+/g, ' ')
    if (!stored && /\d/.test(t)) return t.replace(/[_-]+/g, ' ') // a label, not a noun: said as it is
    const name = stored || t.replace(/[_-]+/g, ' ')
    const before = all.slice(0, at)
    const lead = !before.trim() || /[.!?]\s*$/.test(before) // a sentence starts here: the name keeps its capital
    const det = determined(before)
    const art = ARTICLE.exec(name)
    if (art) return det ? name.slice(art[0].length) : lead ? name : lowerFirst(name)
    if (el?.type === 'person' && /^[A-Z]/.test(name)) return name
    const noun = lead ? name : lowerFirst(name)
    return det ? noun : `${lead ? 'The' : 'the'} ${lead ? lowerFirst(noun) : noun}`
  })
}

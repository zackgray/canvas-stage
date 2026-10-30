// The board's props as the planner reads them (Track C): the scene sentence ends with a "Props:" list naming every prop, one entry
// each as `[tag] name: its own words`. The browser writes it (design/buildCheck.ts planSentence), the planner's prompt explains it
// and the server reads it back (server/planner/propStandIns.ts) to be sure every named prop is in the plan. Pure; shared.
export const PROPS_MARK = 'Props:'

export interface PlanProp { tag: string; name: string; line: string }

const TAG = /^[a-z][a-z0-9_-]{0,31}$/
const clean = (s: string) => s.replace(/[;\[\]]/g, ',').replace(/\s+/g, ' ').trim()
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '').trimEnd() + '…' : s)

/** one entry: the tag, the name, and the prop's own words when they say more than the name */
function entry(p: PlanProp, line: number): string {
  const name = clean(p.name), words = clean(p.line).replace(/\.$/, '')
  const said = !words || words.toLowerCase() === name.toLowerCase()
  return `[${p.tag}] ${clip(name, 40)}${said ? '' : `: ${clip(words, line)}`}`
}

/**
 * " Props: [hive] Beehive: a white-painted hive; …" fitted to `room` characters (0 = no props): every prop keeps its tag and name,
 * and the words are shortened evenly until the whole list fits; a list that cannot fit even bare drops its last entries.
 */
export function propsClause(props: readonly PlanProp[], room: number): string {
  const ok = props.filter((p) => TAG.test(p.tag) && clean(p.name))
  for (let n = ok.length; n > 0; n--) {
    for (const line of [120, 80, 50, 30, 0]) {
      const text = ` ${PROPS_MARK} ${ok.slice(0, n).map((p) => entry(p, line)).join('; ')}.`
      if (text.length <= room) return text
    }
  }
  return ''
}

/** the props a sentence ends with ([] when it has no Props list) */
export function propsOf(sentence: string): PlanProp[] {
  const at = sentence.lastIndexOf(PROPS_MARK)
  if (at < 0) return []
  const out: PlanProp[] = []
  for (const part of sentence.slice(at + PROPS_MARK.length).replace(/\.\s*$/, '').split(';')) {
    const m = /^\s*\[([a-z][a-z0-9_-]{0,31})\]\s*([^:]*?)\s*(?::\s*(.*?))?\s*$/.exec(part)
    if (m && m[2]) out.push({ tag: m[1], name: m[2], line: m[3] ?? '' })
  }
  return out
}

/** the sentence without its Props list (what the place says) */
export function sentenceOf(sentence: string): string {
  const at = sentence.lastIndexOf(PROPS_MARK)
  return (at < 0 ? sentence : sentence.slice(0, at)).trim()
}

/**
 * Person traits are removed, not sent (plan section 2.1, the "elderly stoops from frame 0" finding): age, build, mood and
 * health words describe how the person looks, which her cast card already says, and they leak into the generated pose itself.
 * They are taken out of the words before anything else runs, and the panel says so once. Manner words (slowly, carefully …)
 * are different: they describe the move, so they stay and become the sentence's adverb. There is no default adverb and no
 * house style added anywhere. Pure.
 */
import { normalise } from './classify.ts'

/** age, build, mood, health: removed, never sent */
const TRAITS = ['elderly', 'old man', 'old woman', 'old', 'older', 'young', 'younger', 'teenage', 'tired', 'sleepy', 'exhausted', 'heavy', 'overweight', 'frail', 'drunk', 'injured', 'hurt', 'sad', 'nervous', 'scared', 'frightened', 'pregnant', 'sick', 'ill', 'weak', 'lame', 'hunched', 'grey haired', 'gray haired', 'grumpy', 'cheerful', 'angry']

/** kept: they qualify the move, not the person; the first one becomes the sentence's adverb */
const MANNERS = ['with effort', 'slowly', 'carefully', 'quickly', 'gently', 'laboriously', 'steadily', 'cautiously', 'clumsily', 'gracefully']

export type TraitResult = {
  /** the words with every trait removed (manners kept) */
  words: string
  /** the trait phrases taken out, for the panel's one-line note */
  removed: string[]
  /** the first manner phrase, when the words carry one; undefined otherwise (no default is invented) */
  manner?: string
  /** shown once, naming what was left out; undefined when nothing was removed */
  note?: string
}

export function stripTraits(raw: string): TraitResult {
  let w = ` ${normalise(raw)} `
  const removed: string[] = []
  for (const t of TRAITS) {
    if (w.includes(` ${t} `)) { w = w.replace(` ${t} `, ' '); removed.push(t) }
  }
  const manner = MANNERS.find((m) => w.includes(` ${m} `))
  const words = w.replace(/\s+/g, ' ').trim()
  const note = removed.length
    ? `Left out '${removed.join("', '")}'. How she looks comes from her cast card; describe the move, e.g. 'slowly, carefully'.`
    : undefined
  return { words, removed, manner, note }
}

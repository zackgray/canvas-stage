/**
 * What the 3D stage cannot perform, checked by the program and never left to the model. Horses, other animals than the dragon,
 * water and vehicles can all be IN the look (board, stills, render: those are drawn from the words); what the 3D blocking cannot
 * do is ride them, perform them, wade in them or drive them. A brief element that names one is marked `supported: false` and
 * gets a warning in the program's own words, whatever the model said; the same words anywhere else in the brief, the background
 * line, the beats or the director's own idea get a warning too. A model warning the rules don't back (a water tank called a
 * vehicle, a railway platform) is dropped. Nothing here rewrites the brief: the words stay the user's until they press Swap. Pure.
 */
import type { BriefElement, BriefWarning, SceneBrief } from '../../src/shared/bibleContract.ts'

export interface Rule {
  issue: string
  /** what Swap puts in place of the word (or as the piece's look line) */
  swap: (word: string) => string
  /** the words that name the thing (also used to recognise the model's own warning) */
  re: RegExp
  /** a second, weaker pattern counted only when `unless` is absent from the text (riding a bicycle is not a mounted figure) */
  weak?: { re: RegExp; unless: RegExp }
}

const VEHICLE = /\b(cars?|trucks?|(?<!\b(?:water|fish|oil|fuel|gas|storage|septic|rain|ink|think|holding|stock|header|hot|feed)[\s-])tanks?(?![\s-]tops?\b)|jeeps?|motorcycles?|motorbikes?|scooters?|bicycles?|bikes?|trains?|trams?|planes?|aircraft|helicopters?|boats?|ships?|canoes?|rafts?|carriages?|chariots?|tractors?|bus|buses|vans?|taxis?|rickshaws?)\b/i

export const RULES: Rule[] = [
  { issue: 'horses can be in the look (board, stills, render), but nobody can ride one in the 3D blocking yet', swap: () => 'the same figure on foot',
    re: /\b(horses?|horseback|cavalry(?:man|men)?|steeds?|ponies|pony|mules?|donkeys?|camels?|saddled?|gallop(?:s|ing|ed)?)\b/i,
    weak: { re: /\b(riders?|riding|rides|rode)\b/i, unless: VEHICLE } },
  { issue: 'water can be in the look (board, stills, render), but the 3D set has no water yet: nobody can wade or swim in it', swap: () => 'wet mud and puddles, or keep the water off-screen',
    re: /\b(rivers?|sea|seas|ocean|lakes?|creek|brook|waterfall|surf|shoreline|tide|flood(?:s|ed|water|waters)?|swim(?:s|ming)?|wading|waves crash\w*)\b/i },
  { issue: 'vehicles can be in the look (board, stills, render), but nothing can be driven or ridden in the 3D blocking yet', swap: (w) => `${w} standing still`,
    re: VEHICLE },
]
/** any animal but the dragon (horses and their kin are the first rule) */
export const ANIMAL_RULE: Rule = {
  issue: 'animals can be in the look (board, stills, render), but only the dragon can be performed in 3D yet', swap: (w) => `${w} standing still in the background`,
  re: /\b(dogs?|puppy|puppies|hounds?|collies?|cats?|kittens?|birds?|crows?|ravens?|pigeons?|gulls?|seagulls?|owls?|eagles?|hawks?|hens?|goats?|sheep|cows?|cattle|oxen|pigs?|wolf|wolves|deer|stags?|rats?|mice|foxes|fox|monkeys?|snakes?|lions?|tigers?|elephants?|whales?|sharks?)\b/i,
}
const DRAGON = /\b(dragon|wyrm|drake)\b/i
const ALL = [...RULES, ANIMAL_RULE]

/** every word a text breaks a rule with, in order (the weak pattern only when the strong one found nothing) */
export function ruleWords(rule: Rule, text: string): string[] {
  const all = (re: RegExp) => [...text.matchAll(new RegExp(re.source, 'gi'))].map((m) => m[0].toLowerCase())
  const strong = all(rule.re)
  return strong.length || !rule.weak || rule.weak.unless.test(text) ? strong : all(rule.weak.re)
}

/** the rules a text breaks, with the first word that broke each */
export function findUnsupported(text: string): { rule: Rule; word: string }[] {
  return ALL.flatMap((rule) => { const [word] = ruleWords(rule, text); return word ? [{ rule, word }] : [] })
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const warn = (element: string, rule: Rule, word: string): BriefWarning => ({ element, issue: rule.issue, swap: rule.swap(word) })

function elementHits(e: BriefElement): { rule: Rule; word: string }[] {
  // the name says what the thing is: a look's "metal tank" is the "Water Tank" it describes, not a vehicle
  const named = findUnsupported(e.name)
  const hits = [...named, ...findUnsupported(e.look).filter((h) => !named.some((n) => n.rule === h.rule) && !new RegExp(`\\b${h.word}`, 'i').test(e.name))]
  if (e.type === 'creature' && !DRAGON.test(`${e.name} ${e.look} ${e.tag}`) && !hits.some((h) => h.rule === ANIMAL_RULE))
    hits.push({ rule: ANIMAL_RULE, word: e.name.toLowerCase() })
  return hits
}

/**
 * The brief with the program's own support check applied: elements naming an unsupported thing are `supported: false`, every
 * unsupported thing has one warning in the program's words, and words in the idea or the prose get one per rule too. The model's
 * own warnings are kept only when they are about an element it marked unsupported that no rule covers. The brief's words are
 * never changed here.
 */
export function enforceSupport(b: SceneBrief, idea = ''): SceneBrief {
  const warnings: BriefWarning[] = []
  const has = (element: string, rule: Rule) => warnings.some((w) => w.issue === rule.issue && same(w.element, element))
  const elements = b.elements.map((e) => {
    const hits = elementHits(e)
    for (const h of hits) if (!has(e.name, h.rule)) warnings.push(warn(e.name, h.rule, h.word))
    if (!hits.length && !e.supported) {
      const own = b.warnings.find((w) => same(w.element, e.name))
      warnings.push(own ? { ...own } : { element: e.name, issue: 'marked as something the 3D blocking cannot do', swap: 'leave it out, or swap it for something else' })
    }
    return hits.length ? { ...e, supported: false } : { ...e }
  })
  // the model's warnings about things that are not elements: the rules decide (and word them); anything else was a false alarm
  const covered = (r: Rule) => warnings.some((w) => w.issue === r.issue)
  for (const w of b.warnings) for (const h of findUnsupported(w.element)) if (!covered(h.rule)) warnings.push(warn(w.element, h.rule, h.word))
  // the same things written into the brief, background, beats or the idea itself, not already warned about (a word that only
  // repeats a supported element's name is that element: "toward the tank" is the Water Tank)
  const elsewhere = [b.brief, b.background, ...b.beats, idea].join(' \n ').replace(/[@_]/g, ' ')
  const safe = elements.filter((e) => e.supported).map((e) => e.name)
  for (const rule of ALL) {
    const word = covered(rule) ? undefined : ruleWords(rule, elsewhere).find((w) => !safe.some((n) => new RegExp(`\\b${w}\\b`, 'i').test(n)))
    if (word) warnings.push(warn(word, rule, word))
  }
  return { ...b, elements, warnings }
}

/** A flesh-out's warnings: the description's unsupported words. */
export function fleshWarnings(name: string, description: string): BriefWarning[] {
  return findUnsupported(description).map((h) => warn(name, h.rule, h.word))
}

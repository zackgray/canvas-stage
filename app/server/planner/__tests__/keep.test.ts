// The idea's details survive Develop or the user is told (must-keep), the support rules have no false alarms (a water tank, a
// railway platform, a dog), their wording is true (in the look, not in 3D), and nothing here rewrites the user's words.
import { describe, expect, it } from 'vitest'
import type { SceneBrief } from '../../../src/shared/bibleContract.ts'
import { checkBriefText, parseBrief } from '../briefCheck.ts'
import { droppedTerms, mustKeep } from '../mustKeep.ts'
import { planSystemPrompt } from '../planText.ts'
import { ANIMAL_RULE, enforceSupport, findUnsupported, RULES } from '../unsupported.ts'
import QA from './qa1024-answers.json'
import { BRIEF } from './rig.ts'
import { RUN1_IDEA, RUN1_V2 } from './v2rig.ts'

const words = (text: string) => findUnsupported(text).map((h) => h.word)
const brief = (o: Partial<SceneBrief>): SceneBrief => ({ ...(BRIEF as SceneBrief), ...o })
const dropped = (idea: string, b: SceneBrief) => droppedTerms(idea, b).map((t) => t.word)

describe('must-keep: the idea\'s defining details', () => {
  it('finds the period, place, ages, named things, air and light of each QA idea', () => {
    expect(mustKeep(QA.ideas.jazz).map((t) => t.word)).toEqual(expect.arrayContaining(['1950s', 'piano', 'bass', 'drums', 'microphone', 'spotlight', 'candlelit']))
    expect(mustKeep(QA.ideas.market).map((t) => t.word)).toEqual(expect.arrayContaining(['coastal', 'Asian', 'teenage', 'bicycle', 'neon', 'steam']))
    expect(mustKeep(QA.ideas.railway).map((t) => t.word)).toEqual(expect.arrayContaining(['dawn', 'breath', 'fogging', 'lamps', 'railway', 'train']))
  })
  it('a brief that dropped "1950s" and the bicycle is flagged; synonyms and plurals count as kept', () => {
    const idea = 'a teenage courier on a bicycle crosses a 1950s city at night'
    const lost = brief({ brief: 'Night in the city. @soldier walks on foot past a burning @cart.', elements: [{ ...BRIEF.elements[0], look: 'a teenager in a coat' }, BRIEF.elements[1]] as SceneBrief['elements'] })
    expect(dropped(idea, lost)).toEqual(['1950s', 'bicycle'])
    const kept = brief({ brief: "Night in a fifties city. A @soldier rides his bicycle past a burning @cart.", elements: lost.elements })
    expect(dropped(idea, kept)).toEqual([])
    expect(dropped('lamps and kids at dawn', brief({ brief: 'At sunrise two children walk by a lamplit @cart.' }))).toEqual([])
  })
  it('a ride turned into walking is not "left out": the act is not a detail to keep, the thing is (m-6)', () => {
    const walked = brief({ brief: 'At dusk @soldier walks the ridge on foot past a burning @cart.' })
    expect(dropped('a messenger rides along the ridge at dusk', walked)).toEqual([])
    expect(dropped('a messenger on horseback along the ridge at dusk', walked)).toEqual(['horseback'])
  })
  it('the real QA answers: what each dropped comes back as a visible warning, the brief text unchanged', () => {
    const run = (k: keyof typeof QA.ideas) => { const r = checkBriefText(QA.answers[k], QA.ideas[k]); if (!r.ok) throw new Error(r.errors.join('; ')); return r.brief }
    const jazz = run('jazz')
    expect(jazz.warnings.find((w) => /left it out/.test(w.issue))?.element).toMatch(/1950s.*piano.*bass.*drums/)
    const market = run('market')
    expect(market.brief).toMatch(/weaves on foot/) // the model's words, not ours
    const bike = market.warnings.find((w) => w.element === 'bicycle')
    expect(bike?.issue).toMatch(/left it out[\s\S]*Vehicles can be in the look/)
    expect(market.warnings.find((w) => /left it out/.test(w.issue) && w !== bike)?.element).toMatch(/coastal.*Asian/)
    const railway = run('railway')
    expect(railway.warnings.find((w) => w.issue.startsWith('your idea'))?.element).toMatch(/breath.*lamps.*railway/)
    expect(railway.warnings.map((w) => w.element)).not.toContain('Snowy mountain railway platform')
    const canyon = run('canyon')
    expect(canyon.warnings.map((w) => [w.element, w.issue.match(/^(\w+) can be in the look/)?.[1]])).toEqual([['Dog', 'animals'], ['Desert', undefined]])
    expect(canyon.elements.find((e) => e.tag === 'water_tank')?.supported).toBe(true)
  })
})

describe('the support rules: no false alarms, true wording', () => {
  it('a water tank, a fish tank and a tank top are not vehicles; a tank and a jeep are', () => {
    expect(words('a rusted water tank')).toEqual([]); expect(words('a fish tank, a water-tank and a tank top')).toEqual([])
    expect(words('an army tank rolls past')).toEqual(['tank']); expect(words('the jeep')).toEqual(['jeep'])
  })
  it('a railway platform is not a vehicle; the train is', () => {
    expect(words('a snowy mountain railway platform')).toEqual([])
    expect(words('a steam train at the platform')).toEqual(['train'])
  })
  it('light flooding the stage is not water; a courier riding a bicycle is not a mounted figure', () => {
    expect(words('a spotlight flooding the stage, floodlights')).toEqual([])
    expect(words('a courier riding a bicycle')).toEqual(['bicycle'])
    expect(words('a knight rides into the village')).toEqual(['rides'])
  })
  it('a dog gets the animal warning, not "the only creature is the dragon"; the warning says it can be in the look', () => {
    const dog = { name: 'Dog', tag: 'dog', type: 'creature' as const, look: 'a scruffy dog', supported: true }
    const b = enforceSupport(brief({ elements: [...BRIEF.elements, dog] as SceneBrief['elements'], warnings: [{ element: 'scruffy dog', issue: 'only a dragon is supported as a creature', swap: 'a scruffy dog' }] }))
    expect(b.warnings).toEqual([{ element: 'Dog', issue: ANIMAL_RULE.issue, swap: 'dog standing still in the background' }])
    expect(b.warnings[0].issue).toMatch(/can be in the look.*only the dragon can be performed in 3D/)
    expect(b.elements.find((e) => e.tag === 'dog')?.supported).toBe(false)
    for (const r of RULES) expect(r.issue).toMatch(/can be in the look/)
  })
  it("the model's false alarm (a platform called a vehicle) is dropped; a water tank prop is supported", () => {
    const tank = { name: 'Water Tank', tag: 'water_tank', type: 'prop' as const, look: 'a large, heavily rusted metal tank', supported: true }
    const b = enforceSupport(brief({ brief: `${BRIEF.brief} A rusted @water_tank.`, elements: [...BRIEF.elements, tank] as SceneBrief['elements'],
      warnings: [{ element: 'Snowy mountain railway platform', issue: 'no water or vehicles of any kind are supported', swap: 'a platform' }] }))
    expect(b.warnings).toEqual([])
    expect(b.elements.every((e) => e.supported)).toBe(true)
  })
})

describe('Keep keeps the user\'s words', () => {
  it('enforceSupport and the must-keep check never change the brief, looks, beats or background', () => {
    const b = brief({ brief: 'A teenage @soldier rides a bicycle past a burning @cart toward the river.' })
    const out = enforceSupport(b, 'a teenage soldier rides a bicycle to the river in the 1950s')
    expect(out.brief).toBe(b.brief); expect(out.elements.map((e) => e.look)).toEqual(b.elements.map((e) => e.look))
    expect(out.beats).toEqual(b.beats); expect(out.background).toBe(b.background)
    const r = checkBriefText(JSON.stringify(b), 'a teenage soldier rides a bicycle to the river in the 1950s')
    expect(r.ok && r.brief.brief).toBe(b.brief)
    expect(r.ok && r.brief.warnings.map((w) => w.element)).toEqual(['river', 'bicycle', '1950s'])
  })
})

describe('the plan prompt fits the set to the sentence', () => {
  it('the doc itself asks for only the pieces the sentence implies: no war-camp filler, default fires or soldier', () => {
    const s = planSystemPrompt()
    expect(s.indexOf('Open, empty ground is better')).toBeGreaterThan(s.indexOf('## Layout rules'))
    expect(s).toMatch(/no crates, barrels, wagon/); expect(s).toMatch(/none in a desert, a city or an interior/)
    expect(s).not.toMatch(/Night scenes need|Needs fires|soldier|war camp|battlefield|surround-hd/i)
  })
})

describe('must-keep reads the v2 brief: the light, the air and the camera the idea asked for', () => {
  const v2 = () => structuredClone(RUN1_V2)
  it("finds them in run 1's idea and in a camera idea", () => {
    expect(mustKeep(RUN1_IDEA).map((t) => t.word)).toEqual(expect.arrayContaining(['golden', 'low golden sun', 'bees']))
    expect(mustKeep('a backlit dancer on a rooftop, sparks in the air; low angle, slow push-in').map((t) => t.word))
      .toEqual(expect.arrayContaining(['backlit', 'sparks', 'low angle', 'push-in']))
  })
  it('kept in the structured fields only (light.height, atmosphere, camera) counts as kept', () => {
    const r = parseBrief(v2(), RUN1_IDEA)
    expect(r.ok && r.brief.warnings).toEqual([])
    const cam = { ...v2(), camera: { size: '', angle: 'low, looking up', move: 'slow push-in', lensFeel: '' } }
    const c = parseBrief(cam, `${RUN1_IDEA} Low angle, slow push-in.`)
    expect(c.ok && c.brief.warnings).toEqual([])
  })
  it('dropped from every field comes back as a warning: the bees, the low golden sun, the camera move (golden stays: the comb materials say it)', () => {
    const lost = { ...v2(), logline: 'In an orchard @beekeeper lifts a @honeycomb_frame from a @wooden_hive.', atmosphere: [],
      light: { key: 'daylight', direction: 'from the left', height: 'high', quality: 'soft', colour: 'white', others: '', effect: '' },
      elements: v2().elements.filter((e) => e.tag !== 'bees'), camera: { size: '', angle: '', move: '', lensFeel: '' } }
    const r = parseBrief(lost, `${RUN1_IDEA} Slow push-in.`)
    expect(r.ok && r.brief.warnings.find((w) => /left it out/.test(w.issue))?.element).toBe('low golden sun, bees, push-in')
  })
})

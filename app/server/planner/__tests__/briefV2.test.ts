// The v2 develop answer (briefContract.ts SceneBriefV2): the prompt's two neutral examples pass the gate as written, the flat lines
// every reader uses today are derived from the structure, the gate's leniency is only where a slip would cost a paid retry, and
// the prompt carries no house style (no default wear, stock, lens or low sun) and no scene the app has run.
import { describe, expect, it } from 'vitest'
import { lightingLine, materialsLine } from '../../bible/briefLines.ts'
import { checkBriefText, parseBrief, type DevelopedBrief } from '../briefCheck.ts'
import { EXAMPLES, RUSTIC, SLEEK } from '../briefExamples.ts'
import { DEVELOP_SYSTEM } from '../briefPrompt.ts'
import { GEN, GEN_DEVELOP, genFor } from '../gemma.ts'
import { RUN1_IDEA, RUN1_V2 } from './v2rig.ts'
import { tagWords } from '../../../src/shared/tagWords.ts'

const ok = (raw: unknown, idea = ''): DevelopedBrief => {
  const r = parseBrief(raw, idea)
  if (!r.ok) throw new Error(r.errors.join(' | '))
  return r.brief
}
const errs = (raw: unknown) => { const r = parseBrief(raw); return r.ok ? [] : r.errors }

describe('the v2 develop answer', () => {
  it('both worked examples pass the gate as they stand, with no warnings and their own words', () => {
    for (const e of EXAMPLES) {
      const b = ok(JSON.parse(JSON.stringify(e.answer)), e.idea)
      expect(b.warnings).toEqual([])
      expect(b.v2?.logline).toBe(e.answer.logline)
      expect(DEVELOP_SYSTEM).toContain(`IDEA: ${e.idea}\n${JSON.stringify(e.answer)}`)
    }
  })
  it('the sleek example ages nothing; the rustic one ages only the wheel its idea calls old', () => {
    expect(ok(SLEEK.answer).v2?.elements.map((e) => e.condition)).toEqual(['', '', ''])
    expect(ok(RUSTIC.answer).v2?.elements.map((e) => e.condition !== '')).toEqual([false, true, false])
    expect(RUSTIC.idea).toMatch(/\bold kick wheel\b/)
    // camera only from the idea: the rustic idea names none, the sleek one names a push-in
    expect(ok(RUSTIC.answer).v2?.camera).toEqual({ size: '', angle: '', move: '', lensFeel: '' })
    expect(ok(SLEEK.answer).v2?.camera.move).toBe('slow push-in to the glass')
  })
  it('the flat lines are derived: logline -> brief, light -> one lighting sentence, materials per element, beats as sentences', () => {
    const b = ok(RUSTIC.answer)
    expect(b.brief).toBe(RUSTIC.answer.logline)
    expect(b.lighting).toBe('Morning sun through the open door from the left of frame, across her and the wheel, low hard warm white light, a bright edge on her forearms and the wet clay, long shadows across the floor; soft daylight bouncing off the whitewashed walls.')
    expect(b.materials).toMatch(/^The potter: linen apron.*; Kick wheel: oiled olive wood, an iron shaft, a stone flywheel, old: the wood worn smooth/)
    expect(b.beats[0]).toBe('Potter kicks the flywheel and the wheel picks up speed.')
  })
  it("run 1's idea in v2: split tags repaired, seconds '2 s' read as 2, lensFeel 'n/a' as '', and the light names a low sun behind her", () => {
    const b = ok(structuredClone(RUN1_V2), RUN1_IDEA)
    expect(b.v2?.logline).toMatch(/lifts a @honeycomb_frame from a @wooden_hive while @bees/)
    expect(b.v2?.elements.map((e) => e.tag)).toEqual(['beekeeper', 'honeycomb_frame', 'wooden_hive', 'bees'])
    expect(b.v2?.beats.map((x) => [x.who, x.seconds])).toEqual([['@beekeeper', 2], ['@beekeeper', 2]])
    expect(b.v2?.camera.lensFeel).toBe('')
    expect(b.lighting).toBe('Low golden sun from behind her, towards the camera, hard warm gold light, a strong rim light on her hair and the comb.')
    expect(b.lighting).toMatch(/\blow\b.*\bsun\b.*\bbehind her\b/i)
  })
  it('shape errors name the field path; tags anywhere but the logline become plain words', () => {
    const bad = { ...RUN1_V2, light: { ...RUN1_V2.light, height: 'medium' }, beats: [{ who: '@ghost', does: 'x', seconds: 99 }], camera: 'low', atmosphere: [{ where: 'x' }] }
    const e = errs(bad).join(' | ')
    expect(e).toMatch(/light\.height: "medium" must be one of "low", "high", "overhead" or ""/)
    expect(e).toMatch(/beats\[0\]\.who: "@ghost" must be one element's @tag \(a tag is ONE lower-case word/)
    expect(e).toMatch(/beats\[0\]\.seconds: 99 must be a number of seconds/)
    expect(e).toMatch(/camera: must be an object/); expect(e).toMatch(/atmosphere\[0\]\.what: required text/)
    expect(errs({ ...RUN1_V2, beats: [] })).toEqual(['beats: required list of 1 to 8'])
    const p = ok({ ...RUN1_V2, beats: [{ who: 'beekeeper', does: 'hands the @honeycomb_frame over', seconds: 2 }] })
    expect(p.v2?.beats[0]).toEqual({ who: '@beekeeper', does: 'hands the honeycomb frame over', seconds: 2, visible: '' })
  })
  it('a v2 answer runs the support check too: a horse is unsupported in both the flat brief and the structure', () => {
    const horse = { ...RUN1_V2, elements: [...RUN1_V2.elements, { name: 'Pony', tag: 'pony', type: 'creature', look: 'a grey pony', materials: '', condition: '', face: '', supported: true }] }
    const b = ok(horse)
    expect(b.v2?.elements.find((x) => x.tag === 'pony')?.supported).toBe(false)
    expect(b.v2?.warnings).toEqual(b.warnings)
    expect(b.warnings.map((w) => w.element)).toContain('Pony')
  })
  it('the flat shape still passes (old answers on disk), and is not taken for v2', () => {
    expect(checkBriefText(JSON.stringify({ brief: 'A long enough @x brief line here.', elements: [{ name: 'X', tag: 'x', type: 'prop', look: 'x', supported: true }], lighting: 'l', materials: 'm', background: '', beats: ['a', 'b', 'c'], warnings: [] }), '')).toMatchObject({ ok: true })
  })
})

describe('the develop prompt (no house style, neutral examples)', () => {
  it('asks for every v2 field in the exact shape, tags as one token with _, condition only when implied, style empty', () => {
    for (const k of ['"logline"', '"place"', '"light"', '"atmosphere"', '"materials"', '"condition"', '"face"', '"beats"', '"who"', '"seconds"', '"camera"', '"lensFeel"', '"style"', '"exclude"', '"developed"']) expect(DEVELOP_SYSTEM).toContain(k)
    expect(DEVELOP_SYSTEM).toMatch(/join words with _/); expect(DEVELOP_SYSTEM).toMatch(/Never add age, dirt, rust, scratches or wear unless the idea/)
    expect(DEVELOP_SYSTEM).toMatch(/"style" is "" unless the idea names a style/)
  })
  it('never teaches a scene the app has run, nor a house look', () => {
    expect(DEVELOP_SYSTEM).not.toMatch(/beekeeper|honeycomb|orchard|railway|war camp|battlefield|jazz|night market|shepherd|ski\b|conductor/i)
    const examples = EXAMPLES.map((e) => JSON.stringify(e.answer)).join(' ')
    expect(examples).not.toMatch(/weathered|rust|kodak|portra|\d+ ?mm\b|cinematic|golden hour|film grain/i)
    // the only wear in either example is the one its idea asked for ("her old kick wheel")
    const WEAR = /\b(worn|old|aged|faded|scuffed|dirty|stained|chipped)\b/i
    expect(WEAR.test(JSON.stringify(SLEEK.answer))).toBe(false)
    const rustic = RUSTIC.answer as { logline: string; elements: { tag: string }[] }
    expect(rustic.elements.filter((e) => WEAR.test(JSON.stringify(e))).map((e) => e.tag)).toEqual(['kick_wheel'])
    expect(rustic.logline).toMatch(/her old @kick_wheel/)
  })
  it('develop gets a longer answer cap than plans and flesh-outs', () => {
    expect(GEN_DEVELOP.maxLength).toBe(1900); expect(genFor('develop')).toBe(GEN_DEVELOP)
    expect(genFor('plan')).toBe(GEN); expect(genFor('flesh').maxLength).toBe(1100)
    expect(lightingLine({ key: '', direction: 'x', height: 'low', quality: '', colour: '', others: '', effect: '' })).toBe('')
    expect(materialsLine([])).toBe('')
  })
})

describe('F3: a tag in a story field is said as its element, with the article English needs', () => {
  const els = [{ tag: 'ana', name: 'Ana', type: 'person' }, { tag: 'bicycle', name: 'The bicycle', type: 'prop' }, { tag: 'field_gate', name: 'Field gate', type: 'prop' }]
  it('a common noun gets "the"; a determiner already there stands; a name with its article keeps it once; a person\'s name as written', () => {
    expect(tagWords('wheels @bicycle through @field_gate', els)).toBe('wheels the bicycle through the field gate')
    expect(tagWords('leans her @bicycle on a @field_gate', els)).toBe('leans her bicycle on a field gate')
    expect(tagWords('hands the @bicycle to @ana', els)).toBe('hands the bicycle to Ana')
    expect(tagWords('@bicycle rattles', els)).toBe('The bicycle rattles')
    expect(tagWords('kicks @stone_wall', els)).toBe('kicks the stone wall') // no element: its own words, as a common noun
  })
})

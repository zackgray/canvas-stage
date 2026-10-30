import { describe, expect, it } from 'vitest'
import { bannedIn } from '../../prompt/banned.ts'
import { buildBriefL2R, buildL2RPrompt, lightWords, unlabel } from '../prompt.ts'

const BATTLE = 'a muddy medieval battlefield at dusk, smoke drifting across trampled grass, a burning wooden palisade, broken spears and fallen banners in the mud, low heavy clouds, firelight on the smoke'
const LIGHT = 'Dusk: a deep blue sky with dark clouds, a low orange sun glowing through smoke ahead, orange firelight on the smoke, the ground dark and in shadow.'

describe('the L2R prompt', () => {
  // stage-only plan, section 5: the fire and grain clause-drop is gone; every word the place, the card or the light says is sent
  it('keeps every clause, fire and grain words included', () => {
    expect(buildL2RPrompt({ place: BATTLE, cast: [] })).toBe(`A${BATTLE.slice(1)}.`)
    expect(buildL2RPrompt({ place: 'a quiet street, Kodak Vision3 500T film grain, wet cobbles', cast: [] })).toMatch(/^A quiet street, Kodak Vision3 500T film grain, wet cobbles\./)
    expect(buildL2RPrompt({ place: 'a hall and a roaring fire', cast: [] })).toMatch(/^A hall and a roaring fire\./)
  })
  it('is the plain shape: the people, the place, the light as its own sentence; nothing added, no fire or grain scrubbed, no screen positions', () => {
    const p = buildL2RPrompt({ place: BATTLE, lighting: LIGHT, cast: [{ name: 'Ana', description: 'a soldier on the left in a dented steel helmet' }] })
    expect(p.split(/(?<=\.)\s/)).toHaveLength(2)
    expect(p).toMatch(/^A soldier in a dented steel helmet, at a muddy medieval battlefield at dusk/)
    expect(p).toMatch(/Dusk, a deep blue sky/)
    expect(p).not.toMatch(/as the driver|Match the first frame|Photoreal/)
    expect(p).toMatch(/a burning wooden palisade.*firelight on the smoke.*orange firelight/) // nothing scrubbed (stage-only plan, section 5)
    expect(p).not.toMatch(/\bleft\b/i) // positions still come off the card (E43)
  })
  it('names two people and works with no cast or no world', () => {
    expect(buildL2RPrompt({ place: 'a street', cast: [{ name: 'a', description: 'a man' }, { name: 'b', description: 'a woman' }] })).toBe('A man and a woman, at a street.')
    // nothing known: no lead at all, never a style word ("A cinematic shot" is gone)
    expect(buildL2RPrompt({ place: '', cast: [] })).toBe('')
    expect(buildL2RPrompt({ place: '', cast: [], camera: 'the camera holds still' })).toBe('')
    expect(buildL2RPrompt({ place: 'A quiet street', cast: [{ name: 'a', description: 'a man' }] })).toBe('A man, at a quiet street.')
    expect(buildL2RPrompt({ place: 'on a cliff edge', cast: [{ name: 'a', description: 'a man' }] })).toBe('A man, on a cliff edge.')
  })
  it('with what each person does it reads place, A does x, while B does y; the set pieces are kept by name', () => {
    const p = buildL2RPrompt({ place: 'a snowy station platform at dawn', lighting: 'Dawn: a low sun behind them', pieces: ['steam train', 'trunk'],
      cast: [{ name: 'c', description: 'a stout conductor in a greatcoat' }, { name: 't', description: 'a lean young man in a brown jacket' }], doing: ['walks slowly towards the camera', 'stands waiting'] })
    expect(p).toBe('At a snowy station platform at dawn, a stout conductor in a greatcoat walks slowly towards the camera, while a lean young man in a brown jacket stands waiting. ' +
      'Dawn, a low sun behind them.')
  })
  it('"a firefighter by a campfire, grainy" survives whole in both writers (the old scrub ate all of it)', () => {
    const fire = 'a firefighter by a campfire, grainy'
    expect(buildL2RPrompt({ place: 'a yard', cast: [{ name: 'a', description: fire }] })).toMatch(/^A firefighter by a campfire, grainy, at a yard\./)
    expect(buildBriefL2R({ camera: '', people: [{ who: fire, doing: '' }], place: 'a yard', air: '', look: '', pieces: [], style: '' }))
      .toMatch(/^A firefighter by a campfire, grainy, in a yard\./)
    expect(buildL2RPrompt({ place: `a quiet road, ${['torchlight', 'sparks', 'Kodak', 'a noisy market'].join(', ')}`, cast: [] })).toMatch(/torchlight, sparks, Kodak, a noisy market/)
  })
  it('bannedIn names each banned word once', () => {
    expect(bannedIn('Fire and fire, grain')).toEqual(['fire', 'grain'])
  })
  it('no camera clause, no "Match the first frame", no keep line and no closer are added', () => {
    const p = buildL2RPrompt({ place: 'a street', cast: [{ name: 'a', description: 'a man' }], doing: ['walks'] })
    expect(p).toBe('At a street, a man walks.')
    expect(p).not.toMatch(/as the driver|Match the first frame|Photoreal|camera/)
  })
  it('the Guided stepper labels never reach the prompt; a bare no-people clause goes only when people are on the set', () => {
    const run1 = 'Set in An old orchard in autumn: rows of trees, long grass, no people. Cast: @keeper. Materials: @mats, an old hive. Beats: @b1.'
    expect(unlabel(run1, true)).toBe('An old orchard in autumn: rows of trees, long grass. @keeper. @mats, an old hive. @b1.')
    expect(unlabel('A field, no people.', false)).toBe('A field, no people.')
    expect(unlabel('Settle in. Cast iron pans.')).toBe('Settle in. Cast iron pans.') // only the labels, not the words
  })
})

describe('the render prompt from a v2 brief (buildBriefL2R)', () => {
  it('the light in the rules order: source, direction, height, quality, colour, effect; nothing repeated', () => {
    expect(lightWords({ key: 'low late-afternoon sun', direction: 'behind her, towards camera', height: 'low', quality: 'hard', colour: 'warm gold', others: '', effect: 'rims her hair' }))
      .toBe('low late-afternoon sun, behind her, towards camera, hard light, warm gold, rims her hair')
    expect(lightWords({ key: 'a single desk lamp', direction: 'the left of frame', height: '', quality: 'soft', colour: '', others: 'a cold window behind', effect: '' }))
      .toBe('a single desk lamp, from the left of frame, soft light, a cold window behind')
    expect(lightWords({ key: 'the sun', direction: '', height: 'overhead', quality: '', colour: '', others: '', effect: '' })).toBe('the sun, overhead')
    expect(lightWords(undefined)).toBe('')
  })
  it('people doing, place; air; the look as its own sentence; the brief style; no camera, Match, Keep or Photoreal', () => {
    const p = buildBriefL2R({ camera: 'A wide shot, the camera pans slowly right', people: [{ who: 'a tall man in a grey coat', doing: 'opens the gate, then steps through' }], place: 'A walled garden',
      air: 'mist moving low over the lawn', look: 'soft overcast daylight; wet slate on the path', pieces: ['iron gate', 'yew hedge'], style: '' })
    expect(p).toBe('A tall man in a grey coat opens the gate, then steps through, in a walled garden. Mist moving low over the lawn. Soft overcast daylight; wet slate on the path.')
    const sleek = buildBriefL2R({ camera: 'The camera rises slowly and pushes in, high up and looking down', people: [], place: 'a glass office tower above a river at dawn', air: '', look: 'cold dawn light from the left', pieces: [], style: 'Clean commercial look.' })
    expect(sleek).toBe('A glass office tower above a river at dawn. Cold dawn light from the left. Clean commercial look.')
  })
  it('no keep line: the set pieces are not named after the place', () => {
    const p = buildBriefL2R({ camera: '', people: [], place: 'a lane', air: '', look: '', pieces: ['a tall hawthorn hedge', 'The bicycle'], style: '' })
    expect(p).toBe('A lane.')
  })
  // updated deliberately (stage-only plan, section 5): every part goes as the brief wrote it, fire and grain words included
  it('every part goes as the brief wrote it: fire and grain words stay', () => {
    const p = buildBriefL2R({ camera: '', people: [{ who: 'a cook', doing: 'stirs a pot' }], place: 'a kitchen, a roaring fire', air: 'embers rising', look: 'warm lamp light, film grain', pieces: [], style: '' })
    expect(p).toBe('A cook stirs a pot, in a kitchen, a roaring fire. Embers rising. Warm lamp light, film grain.')
  })
  it('the brief style closes the prompt when set; nothing closes it when unset (never Photoreal)', () => {
    const base = { camera: '', people: [{ who: 'a cook', doing: 'stirs a pot' }], air: '', look: '', pieces: [], style: '' }
    expect(buildBriefL2R({ ...base, place: 'a kitchen, an oil painting' })).toBe('A cook stirs a pot, in a kitchen, an oil painting.')
    expect(buildBriefL2R({ ...base, place: 'a kitchen, an oil painting', style: 'Soft pastel tones' })).toMatch(/an oil painting\. Soft pastel tones\.$/)
    expect(buildBriefL2R({ ...base, place: 'a kitchen' })).toBe('A cook stirs a pot, in a kitchen.')
    expect(buildL2RPrompt({ place: 'a watercolour of a kitchen', cast: [] })).not.toMatch(/Photoreal/)
  })
})

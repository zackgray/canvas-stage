// Position-free prompt text: stripPositions on the E43 prompt that swapped identities, words it must not mangle,
// outfitLine from cast cards, positionFreePrompt as a whole.
import { describe, expect, it } from 'vitest'
import { outfitLine, positionFreePrompt, stripPositions } from '../outfit.ts'

/** experiments/e38a_graph.ts PROMPT, verbatim: the prompt whose "On the left / On the right" swapped Olivia and Kade. */
const E43_OLD =
  'Two skiers carve down a groomed snowy ski run toward a bend, seen from behind and slightly to the side, in low golden ' +
  'sunset light with the sun ahead of them rim-lighting hair and helmets and their backs in soft blue shade. On the left, ' +
  'Olivia, a woman in a cream-white ski jacket with a teal zip stripe, black ski pants, a black helmet with orange ' +
  'mirrored goggles and a long red braid down her back. On the right, Kade, a man in a charcoal-grey ski jacket with ' +
  'red shoulder panels, black ski pants, black gloves and a black helmet with dark goggles. Fast turns, skis throwing up ' +
  'glittering snow spray, poles planted, natural motion blur, orange safety netting and pine forest on the mountain slope.'

const POSITION = /\b(left|right|behind|in front)\b/i

describe('stripPositions', () => {
  it('E43: the old prompt comes out with no position words and both identities intact', () => {
    const out = stripPositions(E43_OLD)
    expect(out).not.toMatch(POSITION)
    expect(out).toContain('Olivia, a woman in a cream-white ski jacket')
    expect(out).toContain('Kade, a man in a charcoal-grey ski jacket')
    expect(out).toContain('glittering snow spray')
    expect(out).not.toMatch(/\s,|,,|\.\s*,/)
  })

  it.each([
    ['On the left, Olivia waves.', 'Olivia waves.'],
    ['on the right, Kade waves', 'Kade waves'],
    ['ON THE LEFT, Olivia waves.', 'Olivia waves.'],
    ['Olivia stands to the left of Kade.', 'Olivia stands beside Kade.'],
    ['Kade grins on her right, smiling.', 'Kade grins, smiling.'],
    ['A tree in front of the wall.', 'A tree near the wall.'],
    ['A pine behind Theo.', 'A pine near Theo.'],
    ['On the left is Olivia; on the right is Kade.', 'Olivia; Kade.'],
    ['Seen from behind, they walk.', 'they walk.'],
    ['The left man nods.', 'The man nods.'],
  ])('%s', (input, want) => {
    expect(stripPositions(input)).toBe(want)
  })

  it('does not mangle words that contain left/right/bright', () => {
    const s = 'A bright, rightly proud man with a copyright badge, a leftover scarf and left-handed gloves, Playwright style.'
    expect(stripPositions(s)).toBe(s)
  })

  it.each([
    ['They stand about two metres apart, fists up.', 'They stand, fists up.'],
    ['Two skiers, 2 m apart, carve.', 'Two skiers, carve.'],
    ['standing a metre apart and talking', 'standing and talking'],
    ['a few metres apart', ''],
    ['skiing down the slope with their backs to us, crouched', 'skiing down the slope, crouched'],
    ['She waits, her back to the camera.', 'She waits.'],
    ['Both stand facing the camera, smiling.', 'Both stand, smiling.'],
    ['He is turned facing us.', 'He is.'],
    ['both turn their heads to look back over their shoulders', 'both turn their heads to look'],
    ['she is glancing over her shoulder at him', 'she is glancing at him'],
    ['walking side by side down the street', 'walking down the street'],
    ['Two people, side-by-side, wait.', 'Two people, wait.'],
  ])('placement and facing from a still: %s', (input, want) => {
    expect(stripPositions(input)).toBe(want)
  })

  it('placement rules do not mangle outfit or ordinary wording', () => {
    const s = 'A leather bag slung over her shoulder, a scarf over his shoulders, shoulder panels, a two-metre scarf, a backpack, ' +
      'a back pocket, an apartment key, the facing page, facing each other, faces turned toward the camera, a camera bag, steps apart from the crowd.'
    expect(stripPositions(s)).toBe(s)
  })

  it('leaves body-part wording alone', () => {
    expect(stripPositions('He throws a straight right punch.')).toBe('He throws a straight right punch.')
  })
})

describe('outfitLine', () => {
  it('one position-free sentence from name + description', () => {
    expect(outfitLine({ name: 'Theo', description: 'A tall man in a dark coat and grey scarf, standing on the left.' }))
      .toBe('Theo is a tall man in a dark coat and grey scarf, standing.')
  })
  it('folds several sentences into one and drops positions', () => {
    const line = outfitLine({ name: 'Maya', description: 'Shorter woman, rust jacket. Hair tied back. Behind her stands a wall.' })
    expect(line).toBe('Maya is shorter woman, rust jacket; hair tied back; near her stands a wall.')
    expect(line.match(/\.$/g)).toHaveLength(1)
    expect(line).not.toMatch(POSITION)
  })
  it('handles an empty name or description', () => {
    expect(outfitLine({ name: 'Theo', description: '' })).toBe('Theo.')
    expect(outfitLine({ name: '', description: 'a tall man' })).toBe('A tall man.')
  })
  it('caps a very long description', () => {
    expect(outfitLine({ name: 'A', description: 'word '.repeat(300) }).length).toBeLessThan(420)
  })
})

describe('positionFreePrompt', () => {
  it('joins scene, one line per cast card and extras, with no position words', () => {
    const p = positionFreePrompt({
      scene: 'Two people talk at a railing, seen from behind',
      cast: [{ name: 'Theo', description: 'a tall man, dark coat' }, { name: 'Maya', description: 'a shorter woman on his right, rust jacket' }],
      extra: ['Golden hour light.'],
    })
    expect(p).not.toMatch(POSITION)
    expect(p).toContain('Theo is a tall man, dark coat.')
    expect(p).toContain('Maya is a shorter woman, rust jacket.')
    expect(p.endsWith('Golden hour light.')).toBe(true)
  })
})

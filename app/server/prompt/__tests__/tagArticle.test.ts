// The article a tag gets when a word describing it sits between the determiner and the tag (joining track, 2026-10-29): the render
// wrote "his wooden the staff" and "the parked K2 the van". The determiner stands for the tag across one describing word, or two when
// the second is a capitalised or numbered name; never across a word that starts a new phrase. Pure.
import { describe, expect, it } from 'vitest'
import { tagWords } from '../../../src/shared/tagWords.ts'
import { sceneWords } from '../sceneWords.ts'

const els = [{ tag: 'staff', name: 'Staff' }, { tag: 'van', name: 'Van' }, { tag: 'kettle', name: 'Copper kettle' }, { tag: 'lamp', name: 'The lamp' },
  { tag: 'ana', name: 'Ana', type: 'person' }]

describe('a describing word between the determiner and the tag', () => {
  it('one word: the determiner stands for the tag', () => {
    expect(tagWords('he leans on his wooden @staff', els)).toBe('he leans on his wooden staff')
    expect(tagWords('she lifts the old @kettle', els)).toBe('she lifts the old copper kettle')
    expect(tagWords('a dusty @lamp glows', els)).toBe('a dusty lamp glows')
  })
  it('two words when the second is a capitalised or numbered name', () => {
    expect(tagWords('beside the parked K2 @van', els)).toBe('beside the parked K2 van')
  })
  it('a word that starts a new phrase, or a verb after a noun, still gets "the"', () => {
    expect(tagWords('a cook with @kettle', els)).toBe('a cook with the copper kettle')
    expect(tagWords('the cook lifts @kettle', els)).toBe('the cook lifts the copper kettle')
    expect(tagWords('the cook and @ana', els)).toBe('the cook and Ana')
    expect(tagWords('lifts @kettle from the stove', els)).toBe('lifts the copper kettle from the stove')
  })
  it('as before: a determiner right before the tag, a sentence start, a person by name', () => {
    expect(tagWords('his @staff', els)).toBe('his staff')
    expect(tagWords('@kettle sits on the stove. Then @ana pours.', els)).toBe('The copper kettle sits on the stove. Then Ana pours.')
  })
  it('the scene words the draw and the render read say it the same way', () => {
    expect(sceneWords('@ana leans on her wooden @staff.', { elements: [{ tag: 'ana', name: 'Ana', kind: 'cast' }, { tag: 'staff', name: 'Staff', kind: 'prop' }],
      cards: { ana: 'A cook in a white apron.' } })).toBe('A cook in a white apron leans on her wooden staff.')
  })
})

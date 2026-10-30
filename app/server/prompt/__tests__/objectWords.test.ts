import { describe, expect, it } from 'vitest'
import { elementCards, sceneWords } from '../sceneWords.ts'
import { objectWords } from '../objectWords.ts'

const BAD = /photo|straight on|straight-on|view|angle|shot/i
// the owner's real bible (loc-2026-10-29T17-39-23-056): the grandstand line is the concept draw's words
const elements = [
  { tag: 'car', kind: 'prop', line: 'An open-wheel single-seater race car with wide slick tyres, matte black and red.' },
  { tag: 'grandstand', kind: 'prop', line: 'A straight on photo of a race track grand stand stadium.' },
]

describe('objectWords', () => {
  it('drops the way the object was pictured and keeps the object', () => {
    expect(objectWords('A straight on photo of a race track grand stand stadium.', 'grandstand')).toBe('a race track grand stand stadium.')
    expect(objectWords('A product photograph of a brass lantern, seen from the side.', 'lantern')).toBe('a brass lantern.')
    expect(objectWords('A red barn in side view.', 'barn')).not.toMatch(BAD)
  })
  it('leaves an ordinary object line alone', () => {
    expect(objectWords('An open-wheel single-seater race car with a tall rear wing.')).toBe('An open-wheel single-seater race car with a tall rear wing.')
  })
  it('falls back to the label when nothing is left', () => {
    expect(objectWords('A straight on photo of.', 'grand_stand')).toBe('grand stand')
  })
})

describe('@tag swap for a piece', () => {
  it('says the grandstand with no camera, view or photo wording', () => {
    const cards = elementCards(elements)
    const out = sceneWords('@car races past @grandstand at dusk.', { elements, cards })
    expect(out).toContain('race track grand stand stadium')
    expect(out).not.toMatch(BAD)
  })
})
